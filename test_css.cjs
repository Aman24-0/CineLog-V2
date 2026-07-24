const fs = require('fs');

const cssContent = fs.readFileSync('src/styles/tokens/colors.css', 'utf8');

const regexes = [
  /--color-status-planned/,
  /--color-status-watching/,
  /--color-rating-imdb/,
  /--color-rating-rotten-tomatoes/,
  /--glass-blur/
];

for (const regex of regexes) {
  console.log(`Matching ${regex}: ${regex.test(cssContent)}`);
}
