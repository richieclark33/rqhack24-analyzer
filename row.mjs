import fs from 'fs';
import PDFParser from 'pdf2json';
import { AzureOpenAI } from "openai";
import clipboardy from "clipboardy";



async function parse (pdfPath) {
	var pdfParser = new PDFParser();

	// adding try/catch/printstack 'cause pdfParser seems to prevent errors from bubbing up (weird implementation).
	// It also doesn't seem to implement the callback(err, otherdata) convention used in most Node.js modules, so let's fix that here.
    const pdfData = await new Promise((resolve, reject) => {
        pdfParser.on('pdfParser_dataReady', resolve);
        pdfParser.on('pdfParser_dataError', reject);
        pdfParser.loadPDF(pdfPath);
    });

    return pdfParserCallback(pdfData);


	function pdfParserCallback (data) {
		// PDF's contain pages and each page contains Texts. These texts have an x and y value.
		// So finding Texts with equal y values seems like the solution.
		// However, some y values are off by 0.010 pixels/points so let's first find what the smallest y value could be.

		// Let's find Texts with the same x value and look for the smallest y distance of these Texts (on the same page of course)
		// Then use those smallest y values (per page) to find Texts that seem to be on the same row
		// If no smallest y value (per page) can be found, use 0 as smallest distance.


		// Let's get started:


		// find smallest y value between 2 texts with equal x values:
		var smallestYValueForPage = [];

		for (var p = 0; p < data.Pages.length; p++) {
			var page = data.Pages[p];

			var smallestYValue = null; // per page

			var textsWithSameXvalues = {};

			for (var t = 0; t < page.Texts.length; t++) {
				var text = page.Texts[t];

				if(!textsWithSameXvalues[text.x]) {
					textsWithSameXvalues[text.x] = [];
				}
				textsWithSameXvalues[text.x].push(text);
			}

			// find smallest y distance:
			for(var x in textsWithSameXvalues){
				var texts = textsWithSameXvalues[x];

				for (var i = 0; i < texts.length; i++) {
					var firstYvalue = texts[i].y;

					for (var j = 0; j < texts.length; j++) {
						if(texts[i] !== texts[j]) {

							var distance = Math.abs(texts[j].y - texts[i].y);
							if(smallestYValue === null || distance < smallestYValue) {
								smallestYValue = distance;
							}
						}
					};
				};
			}

			if(smallestYValue === null) smallestYValue = 0;
			smallestYValueForPage.push(smallestYValue);
		}


		// now lets find Texts with 'the same' y-values, Actually y-values in the range of y-smallestYValue and y+smallestYValue:
		var myPages = [];

		for (var p = 0; p < data.Pages.length; p++) {
			var page = data.Pages[p];

			var rows = []; // store Texts and their x positions in rows

			for (var t = 0; t < page.Texts.length; t++) {
				var text = page.Texts[t];

				var foundRow = false;
				for (var r = rows.length - 1; r >= 0; r--) {

					// y value of Text falls within the y-value range, add text to row:
					var maxYdifference = smallestYValueForPage[p];
					if(rows[r].y - maxYdifference < text.y && text.y < rows[r].y + maxYdifference) {

						// only add value of T to data (which is the actual text):
						for (var i = 0; i < text.R.length; i++) {
							rows[r].data.push({
								text: decodeURIComponent(text.R[i].T),
								x: text.x
							});
						};
						foundRow = true;
					}
				};
				if(!foundRow){
					// create new row:
					var row = {
						y: text.y,
						data: []
					};

					// add text to row:
					for (var i = 0; i < text.R.length; i++) {
						row.data.push({
							text: decodeURIComponent(text.R[i].T),
							x: text.x
						});
					};

					// add row to rows:
					rows.push(row);
				}

			};

			// sort each extracted row
			for (var i = 0; i < rows.length; i++) {
				rows[i].data.sort(comparer)
			}

			// add rows to pages:
			myPages.push(rows);
		};

		// flatten pages into rows:
		var rows = [];

		for (var p = 0; p < myPages.length; p++) {
			for (var r = 0; r < myPages[p].length; r++) {
				// now that each row is made of objects
				// we need to extract the 'text' property from the object
				var rowEntries = []
				var row = myPages[p][r].data;
				for (var i = 0; i < row.length; i++) {
					rowEntries.push(row[i].text)
				}
				// now append the extracted and ordered text into the return rows.
				rows.push(rowEntries);			};
		};
		// return callback:
		return { rows, myPages};
	}
}

var comparer = function (a, b) {
	/*
		Compares two objects by their 'x' properties.
	*/
  if (a.x > b.x) {
    return 1;
  }
  if (a.x < b.x) {
    return -1;
  }
  // a must be equal to b
  return 0;
}


// Get command line argument
const pdfPath = "C:\\Users\\RClark\\Downloads\\CCCDF-bad-data.pdf";

if (!pdfPath) {
  console.log('Please provide a PDF file path.');
  console.log('Usage: node pdfReader.mjs <path-to-pdf>');
  process.exit(1);
}

try {
  const result = await parse(pdfPath);
  const convertedObj = JSON.stringify(result.myPages)
  clipboardy.writeSync(JSON.stringify(result.myPages));
  const client = new AzureOpenAI({
    endpoint: "https://ortthackathon.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2024-08-01-preview",
    apiVersion: "2024-08-01-preview",
    apiKey: ""
  });
        //   //   // Analyze with OpenAI
    client.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `You will be provided with an array of data representing a pdf document.  In the array, each sub array is a page. 
        For those arrays, each entry is a row which is represented by 'y'. The 'data' is the list of items in that row.  
        Determine the column position by the 'x' of that data and the content is the 'text'.  The pdf data will be between the triple quote. Use that data to determine layout and rows and columns of tables based on the 'x' and the 'y' coordinates.   
        The 'x' values represent columns, and the 'y' values represent rows. Your task will be to answer the question, and if you cannot simply write: "Insufficient information". On page 2, in the main tables there are 6 columns to account for when asked questions.`
      },
      {
        role: "user",
        content: `"""${convertedObj}"""  Question: On page 2, Verify that the Loan Costs Subtotals is correct per column.  Take each row and use the x to determine column. Use the 'text' to verify subtotal.  Show your work.`
      }
    ],
    model: "gpt-4.0",
  }).then((response) => {
    console.log(response.choices[0].message.content);
  })

  // console.log('Total pages:', result.pageCount);
  // console.log('\nExtracted text:\n');
   // console.log(result.text);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}