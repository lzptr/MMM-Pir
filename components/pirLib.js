/** PIR library **/
/** bugsounet **/

const exec = require('child_process').exec
const path = require('path')

class PIR {
  constructor(config, callback) {
    this.config = config
    this.callback = callback
    this.default = {
      debug: this.config.debug,
      gpio: 14,
      reverseValue: false
    }
    this.config = Object.assign({}, this.default, this.config)
    this.log = this.config.debug ? (...args) => { console.log("[MMM-Pir] [LIB] [PIR]", ...args) } : () => { }
    this.running = false
    this.monitorProcess = null
    this.PathScript = path.join(path.dirname(require.resolve('../package.json')), "scripts")
    this.log("Initialized with GPIO:", this.config.gpio)
    this.callback("PIR_INITIALIZED")
  }

  start() {
    if (this.running) {
      this.log("Already running")
      return
    }

    this.log("Start monitoring on GPIO", this.config.gpio)
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
    if (this.monitorProcess) {
      this.stop()
    }

    this.running = true
    const monitorPath = path.join(this.PathScript, "monitor.py")

    // Initial state check
    exec(`python ${monitorPath} -v -s -g=${this.config.gpio}`, { cwd: this.PathScript }, (err, stdout, stderr) => {
      if (err) {
        console.error("[MMM-Pir] [LIB] [PIR] Initial state check failed:", err)
        return
      }
      this.log("Initial state check:", stdout.trim())
    })

    // Start continuous monitoring with process group
    this.monitorProcess = exec(`python ${monitorPath} -v -m -g=${this.config.gpio}`, {
      cwd: this.PathScript,
      detached: true,
      shell: true
    })

    // Handle stdout data with buffering
    let buffer = '';
    this.monitorProcess.stdout.on('data', (data) => {
      buffer += data.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the last partial line in the buffer

      lines.forEach(line => {
        line = line.trim();
        if (line === '1') {
          this.log("Motion detected on GPIO", this.config.gpio)
          this.callback("PIR_DETECTED")
        }
      })
    })

    // Handle stderr data
    this.monitorProcess.stderr.on('data', (data) => {
      console.error("[MMM-Pir] [LIB] [PIR] Error:", data.toString())
    })

    // Handle process exit
    this.monitorProcess.on('close', (code) => {
      if (code !== 0 && this.running) {
        console.error("[MMM-Pir] [LIB] [PIR] Monitor process exited with code", code)
        // Attempt to restart if unexpected exit
        setTimeout(() => {
          if (this.running) {
            this.log("Attempting to restart monitoring...")
            this._startStateMonitoring()
          }
        }, 5000)
      }
    })

    // Handle process errors
    this.monitorProcess.on('error', (err) => {
      console.error("[MMM-Pir] [LIB] [PIR] Monitor process error:", err)
    })
  }

  stop() {
    if (!this.running) return

    this.running = false

    if (this.monitorProcess) {
      // Remove all listeners before killing the process
      this.monitorProcess.stdout.removeAllListeners('data');
      this.monitorProcess.stderr.removeAllListeners('data');
      this.monitorProcess.removeAllListeners('close');
      this.monitorProcess.removeAllListeners('error');

      // Kill the Python process and its children
      try {
        process.kill(-this.monitorProcess.pid, 'SIGKILL');
      } catch (e) {
        this.log("Error killing process:", e)
      }

      this.monitorProcess = null
    }

    // Execute cleanup script
    const monitorPath = path.join(this.PathScript, "monitor.py")
    exec(`python ${monitorPath} -c -g=${this.config.gpio}`, { cwd: this.PathScript }, (err) => {
      if (err) {
        console.error("[MMM-Pir] [LIB] [PIR] Cleanup failed:", err)
      }
    })

    this.callback("PIR_STOP")
    this.log("Stopped")
  }
}

module.exports = PIR