/** PIR library **/
/** bugsounet **/

var log = (...args) => { /* do nothing */ }
const exec = require('child_process').exec
const path = require('path')

class PIR {
  constructor(config, callback) {
    this.config = config
    this.callback = callback
    this.default = {
      debug: this.config.debug,
      gpio: 21,
      reverseValue: false
    }
    this.config = Object.assign({}, this.default, this.config)
    if (this.config.debug) log = (...args) => { console.log("[MMM-Pir] [LIB] [PIR]", ...args) }
    this.running = false
    this.PathScript = path.dirname(require.resolve('../package.json')) + "/scripts"
    this.callback("PIR_INITIALIZED")
  }

  start() {
    if (this.running) return
    log("Start")
    try {
      this._startStateMonitoring()
      this.callback("PIR_STARTED")
      console.log("[MMM-Pir] [LIB] [PIR] Started!")
    } catch (err) {
      console.error("[MMM-Pir] [LIB] [PIR] " + err)
      this.running = false
      return this.callback("PIR_ERROR", err.message)
    }
  }

  _startStateMonitoring() {
    this.running = true
    // Monitor GPIO state using Python script
    this.stateInterval = setInterval(() => {
      exec(`python monitor.py -s -g=${this.config.gpio}`, { cwd: this.PathScript }, (err, stdout, stderr) => {
        if (err) {
          console.error("[MMM-Pir] [LIB] [PIR] " + err)
          return this.callback("PIR_ERROR", err.message)
        }
        const value = parseInt(stdout.trim())
        log("Sensor read value: " + value)
        if ((value == 1 && !this.config.reverseValue) || (value == 0 && this.config.reverseValue)) {
          this.callback("PIR_DETECTED")
          log("Detected presence (value: " + value + ")")
        }
      })
    }, 1000) // Check every second
  }

  stop() {
    if (!this.running) return
    if (this.stateInterval) {
      clearInterval(this.stateInterval)
      this.stateInterval = null
    }
    this.running = false
    this.callback("PIR_STOP")
    log("Stop")
  }
}

module.exports = PIR