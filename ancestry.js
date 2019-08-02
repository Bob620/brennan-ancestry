const htmlparser = require("htmlparser2");
const Request = require('request-promise-native');

const constants = require('./constants.json');

module.exports = {
	getPage: (collection, arrival, arrivalX=undefined, birth=undefined, birthX=undefined, gender=undefined, fh=0, count=50) => {
		return new Promise((resolve, reject) => {
			const link = `${constants.uri}/${collection}/?${birth ? `${birth ? `birth=${birth}&` : ''}` : ''}${arrival ? `arrival=${arrival}&` : ''}${arrivalX ? `arrival_x=${arrivalX}&` : ''}${birthX ? `birth_x=${birthX}&` : ''}count=${count}&${gender ? `gender=${gender}&` : ''}fh=${fh}&fsk=MDszODUwOzE5NTA-61-`;
			setTimeout(() => {
				Request.get({
					uri: link,
					headers: {
						'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0'
					}
				}).then(body => {
					body = body.replace(/\r|\n|\t/g, '');
					if (/<h3>Your Search returned zero good matches<\/h3>/g.test(body))
						resolve({entries: [], expectedTotal: 0});
					else {
						const expectedTotal = parseInt(body.match(/Results .{1,10}&ndash;.{1,10} of (.{1,20})<\/h3>/)[1].replace(/,/g, '').trim());
						const table = body.slice(body.search(/(<table.+)/g), body.search(/(<\/table>)/g)) + '</table>';
						const pids = getMatches(body, /pid="(.*?)"/g);

						let tableText = [];

						const parser = new htmlparser.Parser({
							ontext: text => {
								tableText.push(text);
							}
						}, {decodeEntities: true});

						parser.write(table);
						parser.end();

						let next = false;
						resolve({entries: tableText.filter(text => {
							if (next && text === 'Name')
								next = false;
							else if (next) {
								next = false;
								return true;
							} else if (text.startsWith('View Record'))
								next = true;

							return false;
						}).map(name => {
							return {
								name,
								arrival: arrival ? arrival.split('-')[0] : '0000',
								index: pids.shift(),
								collection: collection,
								gender: gender ? gender : '?'
							}
						}), expectedTotal});
					}
				}).catch(err => {
					console.warn(err);
					reject(err);
				});
			}, 5000);
		});
	}
};

function getMatches(string, regex) {
	let matches = [];
	let match;
	while (match = regex.exec(string))
		matches.push(match[1]);
	return matches;
}