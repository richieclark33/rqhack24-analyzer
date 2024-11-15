import fs from 'fs';
import PDFParser from 'pdf2json';
import { AzureOpenAI } from "openai";

async function extractTextFromPDF(pdfPath) {
  const pdfParser = new PDFParser();

  try {
    const pdfData = await new Promise((resolve, reject) => {
      pdfParser.on('pdfParser_dataReady', resolve);
      pdfParser.on('pdfParser_dataError', reject);
      pdfParser.loadPDF(pdfPath);
    });

    const pages = pdfData.Pages;
    let text = '';

    // Extract text from each page
    pages.forEach((page, pageIndex) => {
      text += `\n--- Page ${pageIndex + 1} ---\n`;
      
      // Extract text from each text element
      page.Texts.forEach((textItem) => {
        textItem.R.forEach((element) => {
          // Decode the text (pdf2json encodes special characters)
          text += decodeURIComponent(element.T) + ' ';
        });
      });
    });

    return {
      pageCount: pages.length,
      text
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
        content: "You are a helpful assistant that analyzes PDF documents. Provide a concise summary and key insights from the document."
      },
      {
        role: "user",
        content: `Please analyze this document and provide key insights: ${result.text}`
      }
    ],
    model: "gpt-4.0",
  }).then((response) => {
    console.log(response.choices[0].message.content);
  })

  console.log('Total pages:', result.pageCount);
  console.log('\nExtracted text:\n');
  console.log(result.text);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}