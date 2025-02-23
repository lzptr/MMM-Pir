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
      gpio: 14,  // Changed default to 14
      reverseValue: false
    }
    this.config = Object.assign({}, this.default, this.config)
    if (this.config.debug) log = (...args) => { console.log("[MMM-Pir] [LIB] [PIR]", ...args) }
    this.running = false
    this.PathScript = path.dirname(require.resolve('../package.json')) + "/scripts"
    log("Initialized with GPIO:", this.config.gpio)  // Debug log
    this.callback("PIR_INITIALIZED")
  }

  start() {
    if (this.running) return
    log("Start monitoring on GPIO", this.config.gpio)  // Debug log
    try {
      this._startStateMonitoring()
      this.callback("PIR_STARTED")
      console.log("[MMM-Pir] [LIB] [PIR] Started on GPIO", this.config.gpio)
    } catch (err) {
      console.error("[MMM-Pir] [LIB] [PIR] " + err)
      this.running = false
      return this.callback("PIR_ERROR", err.message)
    }
  }

  _startStateMonitoring() {
    this.running = true
    // Monitor GPIO state using Python script with debug
    exec(`python monitor.py -v -s -g=${this.config.gpio}`, { cwd: this.PathScript }, (err, stdout, stderr) => {
      if (err) {
        console.error("[MMM-Pir] [LIB] [PIR] Initial state check failed:", err)
        return
      }
      log("Initial state check:", stdout.trim())
    })

    // Start continuous monitoring
    this.monitorProcess = exec(`python monitor.py -v -m -g=${this.config.gpio}`, { cwd: this.PathScript })

    this.monitorProcess.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n')
      lines.forEach(line => {
        if (line === '1') {
          log("Motion detected on GPIO", this.config.gpio)
          this.callback("PIR_DETECTED")
        }
      })
    })

    this.monitorProcess.stderr.on('data', (data) => {
      console.error("[MMM-Pir] [LIB] [PIR] Error:", data.toString())
    })

    this.monitorProcess.on('close', (code) => {
      if (code !== 0) {
        console.error("[MMM-Pir] [LIB] [PIR] Monitor process exited with code", code)
      }
    })
  }

  stop() {
    if (!this.running) return
    if (this.monitorProcess) {
      this.monitorProcess.kill()
      this.monitorProcess = null
    }
    this.running = false
    this.callback("PIR_STOP")
    log("Stop")
  }
}

module.exports = PIR