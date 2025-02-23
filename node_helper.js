/*******************************
* node_helper for MMM-Pir v1.0 *
* BuGsounet ©05/22             *
********************************/

const NodeHelper = require('node_helper')
const parseData = require("./components/parseData.js")
var log = (...args) => { /* do nothing */ }

module.exports = NodeHelper.create({
  start: function () {
    parseData.init(this)
  },

  stop: function () {
    if (this.pir) {
      this.pir.stop()
      this.pir = null
    }
    if (this.screen) {
      this.screen.stop()
      this.screen = null
    }
  },

  socketNotificationReceived: function (notification, payload) {
    switch (notification) {
      case "INIT":
        this.config = payload
        parseData.parse(this)
        break
      case "WAKEUP":
        this.screen.wakeup()
        break
      case "FORCE_END":
        this.screen.forceEnd()
        break
      case "LOCK":
        this.screen.lock()
        break
      case "UNLOCK":
        this.screen.unlock()
        break
    }
  }
});
