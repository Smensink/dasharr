const titles = [
  "Marvel\u0027s Spider-Man: Miles Morales",
  "Marvel\u2019s Spider-Man: Miles Morales", 
  "Marvel\u2018s Spider-Man: Miles Morales",
  "Marvel`s Spider-Man: Miles Morales"
];

function cleanGameName(name) {
  return name
    .toLowerCase()
    .replace(/[\u0027\u2018\u2019]/g, "")
    .replace(/([a-z])-([a-z])/g, "$1$2")
    .trim();
}

titles.forEach((t, i) => {
  console.log(`Title ${i}: "${t}"`);
  console.log(`  Clean: "${cleanGameName(t)}"`);
  console.log(`  Char at 6: "${t.charAt(6)}" = ${t.charCodeAt(6)}`);
});
