# DID — Graph Server Architecture
## Mirror Box Orchestrator | Infrastructure Design Review
## Instrument v1.0 — 2026-03-12

---

## HOW TO USE THIS DOCUMENT

Run this instrument in at least two fresh agent sessions — Claude and Gemini minimum — with no shared context between them. Each agent must produce its output independently before any comparison occurs.

**Step 1:** Open a fresh session. Paste everything from CONTEXT through END OF PROMPT as a single message. Do not add any framing or preamble.

**Step 2:** Repeat in a second fresh session with a different agent.

**Step 3:** Compare outputs. Where agents agree — high confidence. Where they diverge — that divergence is the finding. Do not resolve divergence by picking the more confident answer. Understand why they diverged.

**Step 4:** If divergence is significant, run a tiebreaker: give both outputs to a third fresh session and ask it to adjudicate — not blend, adjudicate.

---

## CONTEXT

Mirror Box Orchestrator (MBO) is an AI coding agent orchestration system. It coordinates multiple AI agents — currently Claude CLI and Gemini CLI — to work on real codebases through a structured pipeline.

The system includes a **Graph MCP Server**: a persistent HTTP server that maintains an Intelligence Graph of the codebase being worked on. The graph is a SQLite database containing file nodes, function nodes, import/call edges, and spec section nodes — built by tree-sitter static analysis and optionally enriched by LSP. The server exposes this graph via the MCP protocol (Streamable HTTP transport) so that any agent client can query it.

**Why HTTP and not stdio:** An earlier implementation used stdio MCP transport. stdio was abandoned (BUG-046) because stdio transport is per-connection — the MCP process exits when the client disconnects, triggering launchd respawn, running a full graph rescan on every agent session, and creating an infinite restart loop. The HTTP server with a persistent SQLite graph solves this: one server, many clients, graph built once.

**Current clients of the graph server:**
- Claude CLI (connects via `.mcp.json`: `{"type": "http", "url": "http://127.0.0.1:3737/mcp"}`)
- Gemini CLI (connects via `.gemini/settings.json`: `{"url": "http://127.0.0.1:3737/mcp"}`)
- MBO Operator process (connects programmatically via `_sendMCPHttp`)
- Future: Tokenizer CLI (a standalone token-counting tool that MBO depends on but which does not depend on MBO)

**How Claude and Gemini handle MCP today:** Their clients point at a URL. That is the entirety of their MCP client logic. They do not start the server, monitor it, retry connections, or manage its lifecycle in any way. If the server is not running, they fail. This is the complete model.

**How the MBO Operator handles MCP today:** The Operator is both a client of the graph server AND responsible for starting it. On initialization, `startMCP()` checks if the port is bound, spawns `mbo-start.sh` if not, waits for a sentinel file, then initializes the MCP session. It persists the session ID to `.dev/run/mcp.session` and restores it on warm restart. It handles SSE response parsing, session eviction, and clean shutdown. This is approximately 200 lines of lifecycle management code on top of the actual client logic.

**The history of failures in this boundary:**

Every bug in the system's recorded history that touches the graph server has been a failure at the boundary between the Operator's lifecycle management and the environment the server actually runs in:

- BUG-046: stdio transport exits with client → infinite launchd restart loop
- BUG-047: Log timestamps missing → debugging impossible
- BUG-049: fd manipulation in launch script causes silent exit in non-launchd contexts
- BUG-053: Session ID lost on Operator reconstruction; SSE response not parsed correctly; warm restart path exits with error code 1

The pattern across all failures: the Operator assumes one launch context (launchd, correct cwd, correct PATH, correct stdio) and runs in another (interactive shell, agent sandbox, different machine). Each fix has added more context-detection code. The boundary has grown more complex with each patch.

**The observation that prompted this review:**

Claude CLI and Gemini CLI's MCP integration "just works" and has never required a bug fix. Their model: declare a URL, connect, use it, done. They have zero lifecycle responsibility. The MBO Operator's model: own the server lifecycle, manage sessions, handle every failure mode. It has required continuous patching.

The hypothesis under review: **the Operator should stop owning the server lifecycle entirely.** The server should be declared infrastructure — started once at install/setup time, managed by launchd alone, and treated as a URL by all clients including the Operator. The Operator becomes a pure client, identical in architecture to Claude CLI and Gemini CLI.

---

## YOUR TASK

You are a senior infrastructure architect. You have been given the above context. You have not seen any prior analysis of this system. You are reasoning from first principles.

Your job is not to validate the hypothesis. Your job is to find every reason it is wrong, incomplete, or would create new problems — and where it fails, to propose what actually works.

Work through all four axes below completely and in order. Do not summarize. Show reasoning, not just conclusions.

---

## AXIS 1 — IS THE HYPOTHESIS CORRECT?

The hypothesis: the Operator should stop managing the graph server lifecycle. The server is started once, at install time, managed exclusively by launchd. All clients — including the Operator — treat it as a URL and connect or fail.

**1a — Attack the hypothesis directly.**

For each of the following claims embedded in the hypothesis, state whether it is true, false, or conditionally true — and show your reasoning:

1. "Claude CLI and Gemini CLI's MCP integration never fails because they don't own server lifecycle." Is this actually why it doesn't fail, or is there another explanation?

2. "The Operator owning server lifecycle is the root cause of the bug history." Is dual client/owner responsibility actually the root cause, or is it a symptom of something deeper?

3. "launchd can reliably own the server lifecycle." What does launchd actually guarantee and not guarantee? Under what conditions does launchd fail to keep the server running?

4. "All clients treating the server as a URL simplifies the system." Does it simplify, or does it shift complexity to the install/setup step and create a different failure mode — a server that is silently wrong (wrong root, stale graph) rather than visibly absent?

**1b — Identify what the hypothesis does not solve.**

If the Operator stops managing server lifecycle, list every problem that remains unsolved:
- How does a developer on a new machine get the server running for the first time?
- How does the server get restarted after a machine reboot without launchd already configured?
- How does any client know the server it connected to is scanning the right project root?
- How does the graph stay current as files change?
- What happens when launchd is not available (Linux, CI, Docker)?

For each unsolved problem: is it a blocking objection to the hypothesis, or is it a solvable operational concern?

**1c — Verdict.**

State clearly: is the hypothesis correct, partially correct, or wrong? If partially correct, state precisely what it gets right and what it gets wrong. If wrong, state what the actual root cause is and what the correct architectural direction is.

---

## AXIS 2 — WHAT ACTUALLY MAKES AN MCP SERVER BULLETPROOF?

Set aside MBO entirely. Answer this question from first principles:

**What properties must a persistent MCP server have to be genuinely reliable across a wide range of machines, operating systems, launch contexts, and client configurations?**

For each property you identify:
- State the property
- State what breaks without it
- State how it is typically achieved in production systems analogous to this one (language servers, database servers, local dev tools)
- State whether the current MBO graph server has it, partially has it, or lacks it entirely

Consider at minimum:
- Root/working directory independence
- Client multiplexing without session conflict
- Graph currency (clients getting stale data without knowing it)
- Graceful degradation when the server is absent
- Cross-platform portability (macOS launchd vs Linux systemd vs no daemon manager)
- Observability (clients knowing server health without polling)
- Install-time vs runtime configuration

**Do not limit yourself to this list.** Surface any property that genuinely matters for reliability.

---

## AXIS 3 — THE INSTALL PROBLEM

The hypothesis depends on a reliable install step that configures launchd correctly. This is where the hypothesis is most vulnerable.

**3a — What does a correct install actually require?**

List every action the install step must perform to guarantee the server runs correctly on a fresh machine. Be exhaustive. Include:
- plist generation with correct absolute paths
- launchd load and verification
- PATH and NODE_PATH configuration for non-login shell context
- Log directory creation
- Port conflict detection
- Verification that the server actually started and is responding

**3b — Attack the install step.**

For each action you listed in 3a, describe the specific real-world condition under which it fails. "It might not work" is not acceptable. Describe the exact failure, the error it produces or silently swallows, and what state the system is left in.

**3c — Cross-platform objection.**

launchd is macOS-only. MBO must work on Linux (for CI, for Docker, for non-Mac developers). What is the cross-platform equivalent? Is it systemd? A simple process supervisor? Something else? Does the answer change the architecture, or is it just a configuration concern?

**3d — Verdict on install reliability.**

Can a correct, reliable, cross-platform install step be built? If yes, what does it look like and what are its remaining failure modes? If no, what does that mean for the hypothesis?

---

## AXIS 4 — WHAT SHOULD ACTUALLY BE BUILT?

Based on your analysis in Axes 1-3, propose the architecture that actually solves the problem.

Your proposal must address:

1. **Server lifecycle ownership** — Who starts the server, who restarts it, who is responsible when it is absent?

2. **Root resolution** — How does the server know which project root to scan? How does a client verify the server it connected to is scanning the right codebase?

3. **Graph currency** — How does the graph stay current as files change? What triggers a rescan? Who is responsible for detecting staleness?

4. **Client contract** — What is the minimum interface a client must implement to use the graph server correctly? What should the Operator's MCP client code look like after this change?

5. **Cross-platform portability** — How does this work on macOS, Linux, and in CI/Docker contexts?

6. **Failure behavior** — When the server is absent or unhealthy, what exactly happens? What does the client see? What does the user see?

Your proposal must be concrete. "Use a process supervisor" is not concrete. "Use launchd on macOS and systemd on Linux, with a shared plist/unit file generator in the install script, and a `mbo server start` command as the fallback for platforms without a supported supervisor" is concrete.

If your analysis concludes the hypothesis is wrong, your proposal should reflect the correct direction instead.

---

## OUTPUT FORMAT

Use these exact section headers:

**AXIS 1 — HYPOTHESIS VERDICT**
**AXIS 2 — RELIABILITY PROPERTIES**
**AXIS 3 — INSTALL PROBLEM**
**AXIS 4 — PROPOSED ARCHITECTURE**

Within each axis, use numbered lists. Show all reasoning. Do not use prose summaries between sections.

End with exactly two sections:

**HIGHEST CONFIDENCE CONCLUSIONS** — no more than five bullet points. Things you are certain of regardless of uncertainty elsewhere. These are load-bearing facts any decision must accommodate.

**MOST DANGEROUS ASSUMPTIONS IN THE CURRENT SYSTEM** — no more than five bullet points. Assumptions the current system makes that, if wrong, cause the most damage. These must be resolved before any further investment in the current architecture.

---

## END OF PROMPT
