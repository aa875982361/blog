import markdownpdf from "markdown-pdf"
import fs from "fs"

// fs.createReadStream("./doc/cursor-learning/overview.md")
//   .pipe(markdownpdf())
//   .pipe(fs.createWriteStream("./doc/cursor-learning/overview.pdf"))

// --- OR ---

markdownpdf().from("./doc/cursor-learning/overview.md").to("./doc/cursor-learning/overview.pdf", function () {
  console.log("Done")
})