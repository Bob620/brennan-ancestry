const Redis = require('ioredis');
const Request = require('request-promise-native');
const htmlparser = require("htmlparser2");

const crypto = require('crypto');

const constants = require('./constants.json');

const redis = new Redis();

/*
	{
		birth: '1844',
		arrival: '1867',
		arrival_x: '0',
		birth_x: '0',
		count: '50',
		fh: '0',
		gender: 'f',
		collection: 'neworleansquarterlypl'
	}
 */

const variables = [{
	birth: '1844',
	birth_x: '0',
	arrival: '1867',
	arrival_x: '0',
	count: '50',
	fh: '0',
	collection: 'pili354'
}];

async function getData(variables, redis) {
	let currentSet = parseInt(variables.fh);
	let expectedTotal = currentSet + 2;
	let oldExpected = expectedTotal;

	for (let i = 0; currentSet < expectedTotal - 1; i++) {
		if (oldExpected !== expectedTotal) {
			console.log(`Expected Total Updated from ${oldExpected} to ${expectedTotal}`);
			oldExpected = expectedTotal;
		}

		if (currentSet % 1000 === 0)
			console.log(`Up to ${currentSet}/${expectedTotal}`);

		const names = await new Promise((resolve, reject) => {
			const link = `${constants.uri}/${variables.collection}/?${variables.birth ? `birth=${variables.birth}&` : ''}arrival=${variables.arrival}&arrival_x=${variables.arrival_x}&${variables.birth_x ? `birth_x=${variables.birth_x}&` : ''}count=${variables.count}&gender=${variables.gender}&fh=${currentSet}&fsk=MDszODUwOzE5NTA-61-`;
			setTimeout(() => {
				Request.get({
					uri: link,
					headers: {
						'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:69.0) Gecko/20100101 Firefox/69.0'
					}
				}).then(body => {
					body = body.replace(/\r|\n|\t/g, '');
					if (/<h3>Your Search returned zero good matches<\/h3>/g.test(body)) {
						expectedTotal = 0;
						resolve();
						console.log(`Search provided 0 good matches.`);
					} else {
						expectedTotal = parseInt(body.match(/Results .{1,10}&ndash;.{1,10} of (.{1,20})<\/h3>/)[1].replace(/,/g, '').trim());
						const table = body.slice(body.search(/(<table.+)/g), body.search(/(<\/table>)/g)) + '</table>';
						const pids = getMatches(body, /pid="(.*?)"/g).map(parseInt);

						let tableText = [];

						const parser = new htmlparser.Parser({
							ontext: text => {
								tableText.push(text);
							}
						}, {decodeEntities: true});

						parser.write(table);
						parser.end();

						let next = false;
						const names = tableText.filter(text => {
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
								arrival: variables.arrival ? variables.arrival.split('-')[0] : '0000',
								index: pids.shift(),
								collection: variables.collection,
								gender: variables.gender ? variables.gender : '?'
							}
						});

						currentSet += names.length;

						resolve(names);
						console.log(`Grabbed ${names.length} names`);
					}
				}).catch(err => {
					console.warn(err);
					reject(err);
				});
			}, 5000);
		});

		if (names)
			for (const {name, arrival, index, collection, gender} of names) {
				const hasher = crypto.createHash('sha256');
				hasher.update(name+arrival+collection+gender+index);
				const hash = hasher.digest().toString('base64');

				redis.sadd(`names`, name);
				redis.sadd(`hashes`, hash);
				redis.sadd(`arrivals`, hash);
				redis.sadd(`collections`, hash);

				redis.sadd(`arrivals-${arrival}`, hash);
				redis.sadd(`collection-${collection}`, hash);
				redis.sadd(`names-${name}`, hash);

				redis.set(`hashes-${hash}-name`, name);
				redis.set(`hashes-${hash}-collection`, collection);
				redis.set(`hashes-${hash}-arrival`, arrival);
				redis.set(`hashes-${hash}-gender`, gender);
				redis.set(`hashes-${hash}-index`, index);
			}
	}

	return {totalProcessed: currentSet, expected: expectedTotal};
}

new Promise(async (resolve, reject) => {
	try {
		for (const vari of variables) {
			console.log(`Starting new database acquisition(${vari.collection}, ${vari.arrival}, ${vari.fh})`);
			await getData(vari, redis).then(({totalProcessed, expected}) => {
				console.log(`Finished ${totalProcessed}/${expected} (${vari.collection}, ${vari.arrival}, ${vari.fh})`);
			}).catch(err => {
				console.warn(err);
				console.log(`[FAILED] database acquisition(${vari.collection}, ${vari.arrival}, ${vari.fh})`);
			});
		}

		resolve();
	} catch(err) {
		reject(err);
	}
}).then(() => {
	console.log('Finished all database acquisition.');
	process.exit(1);
}).catch(err => {
	console.warn(err);
});

function getMatches(string, regex) {
	let matches = [];
	let match;
	while (match = regex.exec(string))
		matches.push(match[1]);
	return matches;
}