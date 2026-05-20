'use strict';
const utils = require('@iobroker/adapter-core');

class HomeLumina extends utils.Adapter {
  constructor(options) {
    super({ ...options, name: 'lumina' });
    this.on('ready', this.onReady.bind(this));
  }

  async onReady() {
    this.log.info('Lumina adapter started. UI: http://<iobroker>:8082/lumina.0/index.html');
    this.setState('info.connection', true, true);

    // Ensure all dashboard config states exist as proper objects
    const cfgStates = [
      'Dashboard-Positions',
      'Dashboard-Labels',
      'Dashboard-Anchors',
      'Dashboard-PipePoints',
      'Dashboard-PipeLabels',
    ];
    for (const id of cfgStates) {
      await this.setObjectNotExistsAsync(id, {
        type: 'state',
        common: {
          name: id,
          type: 'string',
          role: 'json',
          read: true,
          write: true,
          def: '{}',
        },
        native: {},
      });
    }
  }
}

if (require.main !== module) {
  module.exports = (options) => new HomeLumina(options);
} else {
  new HomeLumina();
}
