import fs from 'fs';
import PDFParser from 'pdf2json';
import { AzureOpenAI } from "openai";
import clipboardy from "clipboardy";

async function extractTextFromPDF(pdfPath) {
  const pdfParser = new PDFParser();

  try {
    const pdfData = await new Promise((resolve, reject) => {
      pdfParser.on('pdfParser_dataReady', resolve);
      pdfParser.on('pdfParser_dataError', reject);
      pdfParser.loadPDF(pdfPath);
    });

    const pages = pdfData.Pages;
    let texts = [];

    // Extract text from each page
    pages.forEach((page, pageIndex) => {
      //texts.push(`\n--- Page ${pageIndex + 1} ---\n`);
      
      // Extract text from each text element
      let txtObj = { x: 0, y: 0, width: 0, sw:0, text: ''};
      page.Texts.forEach((textItem) => {
        textItem.R.forEach((element) => {
          if(txtObj.x + txtObj.sw < textItem.x && txtObj.y == textItem.y ) {
            txtObj.text +=  ' ' + decodeURIComponent(element.T);
            return
          } 
          texts.push(txtObj);
          txtObj = { x: textItem.x, y: textItem.y,  sw: txtObj.sw, width: textItem.w, text: element.T};
          // Decode the text (pdf2json encodes special characters)
          //txtObj.text += ;
        });
       // texts.push(txtObj);
      });
    });

    return {
      pageCount: pages.length,
      text: texts
    };
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

// Get command line argument
const pdfPath = "C:\\Users\\RClark\\Downloads\\CCCDF-bad-data.pdf";

if (!pdfPath) {
  console.log('Please provide a PDF file path.');
  console.log('Usage: node pdfReader.mjs <path-to-pdf>');
  process.exit(1);
}

try {
  const result = await extractTextFromPDF(pdfPath);
  const convertedObj = JSON.stringify(result.text)
  clipboardy.writeSync(convertedObj);
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
        content: `You will be provided with an array of data representing a pdf document.  In the array, each entry has an 'x' (horiziontal position), 'y' (veritical position), and 'text' (cell content) which is the position. 
        The data will be between the triple quote. Use that data to determine layout and rows and columns of tables based on the 'x' and the 'y' coordinates.   
        The 'x' values represent columns, and the 'y' values represent rows. The 'x' value can be 2 off and still be considered a column. Your task will be to answer the question, and if you cannot simply write: "Insufficient information"`
      },
      {
        role: "user",
        content: `"""${convertedObj}"""  Question: On page 2, add the column 'Paid by Borrower - At Closing' for items under 'Services Borrower Did Not Shop For'?`
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