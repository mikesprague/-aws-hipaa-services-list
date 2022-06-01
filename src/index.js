import * as core from '@actions/core';
import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import { createRequire } from 'module';

const { hrtime } = process;

// create shim for 'require' (not natively available in esm style js)
const require = createRequire(import.meta.url);

(async () => {
  const debugStart = hrtime();

  // object with defaults/settings used in script
  const config = {
    url: 'https://aws.amazon.com/compliance/hipaa-eligible-services-reference/',
    selectors: {
      lastUpdated: 'main > div > div > div.lb-txt-none.lb-txt-lead.lb-txt',
      services: 'main > div > div > div:nth-child(2) > ul > li',
    },
    userAgent: 'Script - Get Current AWS HIPAA Services List',
    outputDir: 'docs/',
    filename: 'hipaa-services-list',
  };

  // read in previous results to get date for comparison
  const lastResults = require('../docs/hipaa-services-list.json');
  const { lastUpdated: previousLastUpdated } = lastResults;

  // make http call to fetch html
  const markup = await axios
    .get(config.url, {
      headers: {
        'User-Agent': config.userAgent,
      },
    })
    .then((response) => response.data);

  // create object to hold results
  const hipaaServices = {
    lastUpdated: null,
    serviceList: [],
  };

  // instantiate cheerio with markup from earlier axios request
  const $ = cheerio.load(markup);

  // get last updated date string
  const lastUpdatedString = $(config.selectors.lastUpdated)
    .text()
    .trim()
    .replace('Last Updated: ', '');
  // set lastUpdated in results object
  hipaaServices.lastUpdated = lastUpdatedString;

  // set var with date string comparison results
  const hasUpdates =
    previousLastUpdated.toLowerCase() !== lastUpdatedString.toLowerCase();

  // if date strings are different, proceed with update
  if (hasUpdates) {
    // loop over services list and add to array in results object
    $(config.selectors.services).each((i, elem) => {
      const serviceName = $(elem).text().trim();
      hipaaServices.serviceList.push(serviceName);
    });

    // create JSON string from object data to write to file
    const jsonDataAsString = `${JSON.stringify(hipaaServices, null, 2)}\n`;

    // open html list
    const htmlPrefix = '<ul>\n';
    // build html list from data
    const htmlBody = hipaaServices.serviceList.map(
      (serviceName) => `  <li>${serviceName}</li>\n`,
    );
    // close html list and add last updated string
    const htmlSuffix = `</ul>
<p><small><em>HIPAA services list last updated by AWS on ${lastUpdatedString}</em></small></p>
`;

    // build full html string to write to file
    const htmlToOutput = `${htmlPrefix}${htmlBody.join('')}${htmlSuffix}`;

    // write json file
    const jsonFileName = `${config.outputDir}${config.filename}.json`;
    await fs.writeFileSync(jsonFileName, jsonDataAsString);
    console.log(`JSON file written: ${jsonFileName}`);

    // write html file
    const htmlFileName = `${config.outputDir}${config.filename}.html`;
    await fs.writeFileSync(htmlFileName, htmlToOutput);
    console.log(`HTML file written: ${htmlFileName}`);
    
    // set env var that workflow can use for conditional processing
    core.exportVariable('HAS_UPDATES', true);
  } else {
    // output to run logs
    console.log('No updates to services page, nothing to process');
  }

  // output execution time
  const debugEnd = hrtime(debugStart);
  console.log(
    `Execution time: ${debugEnd[0] * 1000 + debugEnd[1] / 1000000}ms`,
  );
})();
