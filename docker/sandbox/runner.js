// Minimal tool dispatch. No dependencies beyond Node.js stdlib.
const toolId = process.argv[2];
const inputJson = process.argv[3];

if (!toolId || !inputJson) {
  process.stderr.write('Missing toolId or inputJson\n');
  process.exit(1);
}

try {
  const input = JSON.parse(inputJson);
  // Tools are expected to be in /tool/tools/<toolId>.js
  const tool = require(`/tool/tools/${toolId}.js`);

  tool.execute(input)
    .then(r => {
      process.stdout.write(JSON.stringify(r));
      process.exit(0);
    })
    .catch(e => {
      process.stderr.write(e.message);
      process.exit(1);
    });
} catch (e) {
  process.stderr.write(e.message);
  process.exit(1);
}
