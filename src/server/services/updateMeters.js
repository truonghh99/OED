/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const _ = require('lodash');
const Reading = require('../models/Reading');
const validateData = require('../services/validateData');
const { log } = require('../log');

/**
 * Uses the provided dataReader function to poll the provided meters for new readings,
 * and inserts any new readings into the database.
 * @param dataReader {function} A function to fetch readings from each meter
 * @param metersToUpdate [Meter] An array of meters to be updated
 * @param conn the database connection to use
 * @return {Promise.<void>}
 */
const minVal = -Number.MAX_VALUE;
const maxVal = Number.MIN_VALUE;
async function updateAllMeters(dataReader, metersToUpdate, conn) {
	const time = new Date();
	log.info(`Getting meter data ${time.toISOString()}`);
	try {
		// Do all the network requests in parallel, then throw out any requests that fail after logging the errors.
		const readingInsertBatches = _.filter(await Promise.all(
			metersToUpdate
			.map(dataReader)
			.map(p => p.catch(err => {
				let ipAddress = '[NO IP ADDRESS AVAILABLE]';
				if (err.options !== undefined && err.options.ipAddress !== undefined) {
					ipAddress = err.options.ipAddress;
				}
				log.error(`ERROR ON REQUEST TO METER ${ipAddress}, ${err.message}`, err);
				return null;
			}))
		), elem => validateData(elem, minVal, maxVal));

		// Flatten the batches (an array of arrays) into a single array.
		const allReadingsToInsert = [].concat(...readingInsertBatches);
		await Reading.insertOrIgnoreAll(allReadingsToInsert, conn);
		log.info('Update finished');
	} catch (err) {
		log.error(`Error updating all meters: ${err}`, err);
	}
}


module.exports = updateAllMeters;
