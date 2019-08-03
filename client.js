const crypto = require('crypto');

const Redis = require('ioredis');
const redis = new Redis(require('./config/config.json').redis);

const Comm = require('./comm.js');
const ancestry = require('./ancestry.js');

const constants = require('./constants.json');
const config = require('./config/config.json').client;

const comm = new Comm();

comm.sub(`${config.id}`);

comm.onMessage(async (channel, message) => {
	switch(channel) {
		case config.id:
			switch(message.type) {
				case 'getPage':
					messageTypeCB.getPage(message.data, comm.data.pub);
					break;
				case 'getSearch':
					messageTypeCB.getSearch(message, comm);
					break;
			}
			break;
	}
});

const messageTypeCB = {
	getPage: async (settings, redis) => {
		const {entries, expectedTotal} = await ancestry.getPage(settings.collection, settings.arrival, settings.arrivalX, settings.birth, settings.birthX, settings.gender, settings.fh, settings.count);
		processEntries(entries, redis);
		return {entries, expectedTotal};
	},
	getSearch: async (message, comm) => {
		let currentPage = parseInt(message.data.fh);
		let total = currentPage + 2;
		let oldExpectedTotal = 0;

		for (let i = 0; currentPage < total - 1; i++) {
			if (oldExpectedTotal !== total) {
				comm.pub(config.id, {oldTotal: oldExpectedTotal, total});
				oldExpectedTotal = total;
			}

			comm.pub(config.id, {currentPage, total});

			message.data.fh = currentPage;
			let {entries, expectedTotal} = await messageTypeCB.getPage(message.data, comm.data.pub);

			currentPage += entries.length;
			total = expectedTotal;
		}

		comm.pub(config.id, {total, currentPage: currentPage + 1});
	}
};

function processEntries(entries, redis) {
	for (const {name, arrival, index, collection, gender, birth} of entries) {
		const hasher = crypto.createHash('sha256');
		hasher.update(name+arrival+collection+index);
		const hash = hasher.digest().toString('base64');

		redis.sadd(`data-names`, name);
		redis.sadd(`data-hashes`, hash);
		redis.sadd(`data-arrivals`, arrival);
		redis.sadd(`data-collections`, collection);

		redis.sadd(`data-arrivals-${arrival}`, hash);
		redis.sadd(`data-collections-${collection}`, hash);
		redis.sadd(`data-names-${name}`, hash);

		redis.set(`data-hashes-${hash}-name`, name);
		redis.set(`data-hashes-${hash}-collection`, collection);
		redis.set(`data-hashes-${hash}-arrival`, arrival);
		redis.set(`data-hashes-${hash}-birth`, birth);
		redis.set(`data-hashes-${hash}-gender`, gender);
		redis.set(`data-hashes-${hash}-index`, index);
	}
}