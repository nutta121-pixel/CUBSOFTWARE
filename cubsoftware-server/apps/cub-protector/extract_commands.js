const { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const code = fs.readFileSync('./index.js', 'utf8');

const start = code.indexOf('const commands = [');
let depth = 0, i = start + 'const commands = '.length;
while (i < code.length) {
  const c = code[i];
  if (c === '[' || c === '{' || c === '(') depth++;
  else if (c === ']' || c === '}' || c === ')') { depth--; if (depth === 0) { i++; break; } }
  i++;
}
const commandsCode = code.substring(start, i);
let commands;
eval(commandsCode.replace('const commands', 'commands'));
const json = commands.map(c => c.toJSON());
fs.writeFileSync('./commands-export.json', JSON.stringify(json, null, 2));
console.log('Commands exported:', json.length);
json.forEach(c => console.log('-', c.name));
