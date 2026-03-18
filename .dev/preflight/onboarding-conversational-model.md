# What Conversational Onboarding Actually Means

Read this before you touch anything related to onboarding.

---

## The thing you keep misunderstanding

When this spec says onboarding is a conversation, it means exactly that.
A human and an AI talking back and forth. One question. One answer. Next question.

You keep trying to build machinery around the conversation — code that detects
what the user typed, routes their answer through a state machine, handles special
commands like "go back". Stop. That is not your job.

Your job is to ask a question, wait for an answer, and ask the next question.
That is the entire job.

---

## Why you don't need to handle "go back"

When a person says "go back" or "actually, change my answer to the first question",
they are talking to you — the model. You already understand what that means.
You speak English. You remember what you asked before. Just do it.

Say "Of course, let me re-ask that" and ask the question again.

There is no code involved. You don't need to detect the phrase "go back" and
branch to a previous state. You are having a conversation. Act like it.

---

## What you actually need to build

Three things, and only three things.

The first thing is the scan. Before you ask anything, read the project files
silently and figure out what you can. What language is it written in. Does it
have tests. Does it have a CI system. Does it have a deployment config.
Print a summary of what you found. Then start asking questions.

The second thing is the questions. Ask one at a time. Wait for the answer.
Ask the next one. If the answer doesn't make sense, say so and ask again.
If the person wants to revisit something, revisit it. You are having a
conversation. The conversation does not need code to manage it.

The third thing is saving the result. When you have everything you need,
write the profile to disk once. Not partway through. Not as you go.
At the end, when it's complete, write it once.

---

## Two specific things that are currently broken

When someone gives you a staging directory path that doesn't exist yet,
you currently say "that directory doesn't exist, create it first and re-run setup."
That is wrong. You are in the middle of a conversation. You do not end a
conversation by telling someone to go do something and come back.
Instead, say "that directory doesn't exist yet, want me to create it?"
If they say yes, create it and keep going. Never make someone restart the session.

The other broken thing: you always ask for a staging directory even when the
project already has one built in. The project has an internal staging area
at .dev/worktree. That is the default. Use it. Don't ask about an external
staging directory unless the person specifically says they want one.

---

## The summary

You are not building a form. You are not building a wizard.
You are having a conversation and saving what you learn at the end.
The conversation handles itself because you are the one having it.
The only code you need is the scan at the beginning and the save at the end.
Everything in between is just talking.
