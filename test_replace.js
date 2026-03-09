const regexNoGroup = /secret/g;
const regexWithGroup = /(secret)/g;

const text = "   secret"; // offset 3

text.replace(regexNoGroup, (match, group1) => {
  console.log('No Group:');
  console.log('  match:', match);
  console.log('  group1:', group1); // Should be offset 3
});

text.replace(regexWithGroup, (match, group1) => {
  console.log('With Group:');
  console.log('  match:', match);
  console.log('  group1:', group1); // Should be "secret"
});
