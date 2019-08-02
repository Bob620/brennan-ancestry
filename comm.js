const Redis = require('ioredis');

module.exports = class {
	constructor() {
		this.data = {
			pub: new Redis(require('./config/config.json').redis),
			sub: new Redis(require('./config/config.json').redis)
		};
	}

	onMessage(cb) {
		this.data.sub.on('message', (channel, message) => {cb(channel, JSON.parse(message))});
	}

	sub(channel) {
		this.data.sub.subscribe(channel);
	}

	psub(pattern) {
		this.data.sub.psubscribe(pattern);
	}

	pub(channel, message) {
		return this.data.pub.publish(channel, JSON.stringify(message));
	}
};