/** Screen management **/
/** bugsounet **/

const exec = require('child_process').exec
const process = require('process')
const moment = require('moment')
const path = require('path')
var log = (...args) => { /* do nothing */ }


class SCREEN {
  constructor(config, callback) {
    this.config = config;
    this.sendSocketNotification = callback;
    if (this.config.debug) log = (...args) => { console.log("[MMM-Pir] [LIB] [SCREEN]", ...args) };
    this.PathScript = path.dirname(require.resolve('../package.json')) + "/scripts";
    this.interval = null;
    this.cleanupHandlers = [];

    // Default configuration with memory-efficient defaults
    this.default = {
      delay: 5 * 60 * 1000,
      turnOffDisplay: true,
      ecoMode: true,
      displayCounter: true,
      displayBar: false,
      mode: 1,
      gpio: 20,
      clearGpioValue: true
    };
    this.config = Object.assign({}, this.default, this.config); // Create new object to avoid reference issues

    this.screen = {
      mode: this.config.mode,
      running: false,
      locked: false,
      power: false,
      xrandrRotation: null,
      wrandrRotation: null,
      hdmiPort: null,
      forceOnStart: true
    };

    // Initialize validation arrays
    this.xrandrRoation = Object.freeze(["normal", "left", "right", "inverted"]);
    this.wrandrRoation = Object.freeze(["normal", "90", "180", "270", "flipped", "flipped-90", "flipped-180", "flipped-270"]);

    // Set up cleanup handler
    this._setupCleanupHandler();
  }

  _setupCleanupHandler() {
    const cleanup = () => {
      if (this.config.turnOffDisplay && this.config.mode) {
        this.setPowerDisplay(true);
      }
      this._clearInterval();
      this.cleanupHandlers.forEach(handler => handler());
      this.cleanupHandlers = [];
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  _clearInterval() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  activate() {
    if (!this.config.turnOffDisplay && !this.config.ecoMode) {
      log("Disabled.");
      return;
    }
    this.start();
  }

  start(restart = false) {
    if (this.screen.locked || this.screen.running || (!this.config.turnOffDisplay && !this.config.ecoMode)) return;

    log(restart ? "Restart." : "Start.");
    this.sendSocketNotification("SCREEN_PRESENCE", true);

    if (!this.screen.power) {
      if (this.config.turnOffDisplay && this.config.mode) {
        this.wantedPowerDisplay(true);
      }
      if (this.config.ecoMode) {
        this.sendSocketNotification("SCREEN_SHOWING");
        this.screen.power = true;
      }
    }

    this._clearInterval();
    this.counter = this.config.delay;

    // Create interval with proper garbage collection handling
    this.interval = setInterval(() => {
      this.screen.running = true;

      if (this.config.displayCounter) {
        const timerStr = moment(new Date(this.counter)).format("mm:ss");
        this.sendSocketNotification("SCREEN_TIMER", timerStr);
        if (this.config.dev) log("Counter:", timerStr);
      }

      if (this.config.displayBar) {
        this.sendSocketNotification("SCREEN_BAR", this.config.delay - this.counter);
      }

      if (this.counter <= 0) {
        this._clearInterval();
        this.screen.running = false;

        if (this.screen.power) {
          if (this.config.ecoMode) {
            this.sendSocketNotification("SCREEN_HIDING");
            this.screen.power = false;
          }
          if (this.config.turnOffDisplay && this.config.mode) {
            this.wantedPowerDisplay(false);
          }
        }

        this.sendSocketNotification("SCREEN_PRESENCE", false);
        log("Stops by counter.");
      }

      this.counter -= 1000;
    }, 1000);

    // Add interval cleanup to handlers
    this.cleanupHandlers.push(() => this._clearInterval());
  }

  stop() {
    if (this.screen.locked) return;

    if (!this.screen.power) {
      if (this.config.turnOffDisplay && this.config.mode) {
        this.wantedPowerDisplay(true);
      }
      if (this.config.ecoMode) {
        this.sendSocketNotification("SCREEN_SHOWING");
        this.screen.power = true;
      }
    }

    this.sendSocketNotification("SCREEN_PRESENCE", true);
    if (!this.screen.running) return;

    this._clearInterval();
    this.screen.running = false;
    log("Stops.");
  }

  reset() {
    if (this.screen.locked) return;
    this._clearInterval();
    this.screen.running = false;
    this.start(true);
  }

  wakeup() {
    if (this.screen.locked) return;
    this.reset();
  }

  lock() {
    if (this.screen.locked) return;
    this.screen.locked = true;
    this._clearInterval();
    this.screen.running = false;
    log("Locked !");
  }

  unlock() {
    if (!this.screen.locked) return;
    this.screen.locked = false;
    log("Unlocked !");
    this.start();
  }

  forceEnd() {
    this.counter = 0
  }

  async executeCECCommand(command) {
    return new Promise((resolve, reject) => {
      const cec = spawn('cec-client', ['-s', '-d', '1'], {
        shell: true,
        env: { ...process.env, PATH: process.env.PATH }
      });

      let output = '';
      let error = '';

      const cleanup = () => {
        cec.removeAllListeners();
        if (!cec.killed) {
          cec.kill();
        }
      };

      cec.stdin.write(command + '\n');
      cec.stdin.end();

      cec.stdout.on('data', (data) => {
        output += data.toString();
      });

      cec.stderr.on('data', (data) => {
        error += data.toString();
      });

      cec.on('close', (code) => {
        cleanup();
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`CEC command failed with code ${code}: ${error}`));
        }
      });

      cec.on('error', (err) => {
        cleanup();
        reject(err);
      });

      // Add timeout to prevent hanging
      setTimeout(() => {
        cleanup();
        reject(new Error('CEC command timed out'));
      }, 5000);

      // Add cleanup handler
      this.cleanupHandlers.push(cleanup);
    });
  }

  async wantedPowerDisplay(wanted) {
    try {
      let actual = false;
      switch (this.config.mode) {
        case 0:
          log("Disabled mode");
          break;
        case 1:
          const result = await this._execPromise("/usr/bin/vcgencmd display_power");
          actual = Boolean(Number(result.trim().substr(-1)));
          break;
        case 2:
          /** dpms rpi**/
          actual = false
          exec("DISPLAY=:0 xset q | grep Monitor", (err, stdout, stderr) => {
            if (err) {
              this.logError(err)
              this.sendSocketNotification("ERROR", "[SCREEN] dpms command error (mode: " + this.config.mode + ")")
            }
            else {
              let responseSh = stdout.trim()
              var displaySh = responseSh.split(" ")[2]
              if (displaySh == "On") actual = true
              this.resultDisplay(actual, wanted)
            }
          })
          break
        case 3:
          /** tvservice **/
          exec("tvservice -s | grep Hz", (err, stdout, stderr) => {
            if (err) {
              this.logError(err)
              this.sendSocketNotification("ERROR", "[SCREEN] tvservice command error (mode: " + this.config.mode + ")")
            }
            else {
              let responseSh = stdout.trim()
              if (responseSh) actual = true
              this.resultDisplay(actual, wanted)
            }
          })
          break
        case 4:
          /** CEC **/
          try {
            const isOn = await this.checkCECStatus();
            actual = isOn;
            this.resultDisplay(actual, wanted);
          } catch (err) {
            this.logError(err);
            this.sendSocketNotification("ERROR", "[SCREEN] HDMI CEC command error (mode: " + this.config.mode + ")");
          }
          break
        case 5:
          /** dmps linux **/
          exec("xset q | grep Monitor", (err, stdout, stderr) => {
            if (err) {
              this.logError("[Display Error] " + err)
              this.sendSocketNotification("ERROR", "[SCREEN] dpms linux command error (mode: " + this.config.mode + ")")
            }
            else {
              let responseSh = stdout.trim()
              var displaySh = responseSh.split(" ")[2]
              if (displaySh == "On") actual = true
              this.resultDisplay(actual, wanted)
            }
          })
          break
        case 6:
          /** python script **/
          exec("python monitor.py -s -g=" + this.config.gpio, { cwd: this.PathScript }, (err, stdout, stderr) => {
            if (err) {
              this.logError("[Display Error] " + err)
              this.sendSocketNotification("ERROR", "[SCREEN] python relay script error (mode: " + this.config.mode + ")")
            }
            else {
              let responsePy = stdout.trim()
              log("Response PY -- Check State: " + responsePy)
              if (responsePy == 1) actual = true
              this.resultDisplay(actual, wanted)
            }
          })
          break
        case 7:
          /** python script reverse**/
          exec("python monitor.py -s -g=" + this.config.gpio, { cwd: this.PathScript }, (err, stdout, stderr) => {
            if (err) {
              this.logError("[Display Error] " + err)
              this.sendSocketNotification("ERROR", "[SCREEN] python relay script error (mode: " + this.config.mode + ")")
            }
            else {
              let responsePy = stdout.trim()
              log("Response PY -- Check State (reverse): " + responsePy)
              if (responsePy == 0) actual = true
              this.resultDisplay(actual, wanted)
            }
          })
          break
        case 8:
          /** ddcutil **/
          exec("ddcutil getvcp d6", (err, stdout, stderr) => {
            if (err) {
              this.logError(err)
              this.sendSocketNotification("ERROR", "[SCREEN] ddcutil command error (mode: " + this.config.mode + ")")
            }
            else {
              let responseSh = stdout.trim()
              var displaySh = responseSh.split("(sl=")[1]
              if (displaySh == "0x01)") actual = true
              this.resultDisplay(actual, wanted)
            }
          })
          break
        case 9:
          /** xrandr on primary display **/
          exec("xrandr | grep 'connected primary'",
            (err, stdout, stderr) => {
              if (err) {
                this.logError(err)
                this.sendSocketNotification("ERROR", `[SCREEN] xrandr command error (mode: ${this.config.mode})`)
              }
              else {
                let responseSh = stdout.trim()
                var power = "on"
                this.screen.hdmiPort = responseSh.split(" ")[0]
                if (responseSh.split(" ")[3] == "(normal") power = "off"
                if (power == "on") actual = true
                log(`[MODE 9] Monitor on ${this.screen.hdmiPort} is ${power}`)
                this.resultDisplay(actual, wanted)
              }
            }
          )
          break
        case 10:
          /** wl-randr on primary display **/
          exec("WAYLAND_DISPLAY=wayland-1 wlr-randr | grep 'Enabled'",
            (err, stdout, stderr) => {
              if (err) {
                this.logError(err)
                this.sendSocketNotification("ERROR", `[SCREEN] wlr-randr command error (mode: ${this.config.mode})`)
              } else {
                let responseSh = stdout.trim()
                if (responseSh.split(" ")[1] == "yes") actual = true
                exec("WAYLAND_DISPLAY=wayland-1 wlr-randr",
                  (err, stdout, stderr) => {
                    if (err) {
                      this.logError(err)
                      this.sendSocketNotification("ERROR", `[SCREEN] wlr-randr scan screen command error (mode: ${this.config.mode})`)
                    } else {
                      let wResponse = stdout.trim()
                      this.screen.hdmiPort = wResponse.split(" ")[0]
                      log(`[MODE 10] Monitor on ${this.screen.hdmiPort} is ${actual}`)
                      this.resultDisplay(actual, wanted)
                    }
                  })
              }
            }
          )
          break
        case 11:
          if (wanted) {
            // For ON state check, use HDMI CEC
            exec("echo 'pow 0' | cec-client -s -d 1", (err, stdout, stderr) => {
              if (err) {
                this.logError(err)
                this.logError("HDMI CEC Error: " + stdout)
                this.sendSocketNotification("ERROR", "[SCREEN] HDMI CEC command error (mode: 11)")
              } else {
                let responseSh = stdout.trim()
                var displaySh = responseSh.split("\n")[1].split(" ")[2]
                if (displaySh == "on") actual = true
                if (displaySh == "unknown") log("HDMI CEC unknown state")
                this.resultDisplay(actual, wanted)
              }
            })
          } else {
            // For OFF state, we'll use CEC state since GPIO is just a toggle
            exec("echo 'pow 0' | cec-client -s -d 1", (err, stdout, stderr) => {
              if (err) {
                this.logError(err)
                this.logError("HDMI CEC Error: " + stdout)
                this.sendSocketNotification("ERROR", "[SCREEN] HDMI CEC command error (mode: 11)")
              } else {
                let responseSh = stdout.trim()
                var displaySh = responseSh.split("\n")[1].split(" ")[2]
                if (displaySh == "on") actual = true
                if (displaySh == "unknown") log("HDMI CEC unknown state")
                this.resultDisplay(actual, wanted)
              }
            })
          }
          break
      }
      this.resultDisplay(actual, wanted);
    } catch (err) {
      this.logError(err);
      this.sendSocketNotification("ERROR", `[SCREEN] Command error (mode: ${this.config.mode})`);
    }
  }

  resultDisplay(actual, wanted) {
    if (this.screen.forceOnStart) {
      log("Display: Force On Start")
      this.setPowerDisplay(true)
      this.screen.forceOnStart = false
    } else {
      log("Display -- Actual: " + actual + " - Wanted: " + wanted)
      this.screen.power = actual
      if (actual && !wanted) this.setPowerDisplay(false)
      if (!actual && wanted) this.setPowerDisplay(true)
    }
  }

  _execPromise(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  async setPowerDisplay(set) {
    try {
      log(`Display ${set ? "ON." : "OFF."}`);
      this.screen.power = set;
      this.SendScreenPowerState();

      let command = '';
      switch (this.config.mode) {
        case 1:
          command = `/usr/bin/vcgencmd display_power ${set ? '1' : '0'}`;
          break;
        case 2:
          command = `DISPLAY=:0 xset dpms force ${set ? 'on' : 'off'}`;
          break;
        case 3:
          if (set) exec("tvservice -p && sudo chvt 6 && sudo chvt 7")
          else exec("tvservice -o")
          break
        case 4:
          try {
            if (set) {
              await this.executeCECCommand('on 0');
            } else {
              await this.executeCECCommand('standby 0');
            }
          } catch (err) {
            this.logError(err);
          }
          break
        case 5:
          if (set) exec("xset dpms force on")
          else exec("xset dpms force off")
          break
        case 6:
          if (set)
            exec("python monitor.py -r=1 -g=" + this.config.gpio, { cwd: this.PathScript }, (err, stdout, stderr) => {
              if (err) logError(err)
              else log("Relay is " + stdout.trim())
            })
          else
            if (this.config.clearGpioValue) {
              exec("python monitor.py -r=0 -c -g=" + this.config.gpio, { cwd: this.PathScript }, (err, stdout, stderr) => {
                if (err) logError(err)
                else {
                  log("Relay is " + stdout.trim())
                }
              })
            } else {
              exec("python monitor.py -r=0 -g=" + this.config.gpio, { cwd: this.PathScript }, (err, stdout, stderr) => {
                if (err) logError(err)
                else {
                  log("Relay is " + stdout.trim())
                }
              })
            }
          break
        case 7:
          if (set) {
            if (this.config.clearGpioValue) {
              exec("python monitor.py -r=0 -c -g=" + this.config.gpio, { cwd: this.PathScript }, (err, stdout, stderr) => {
                if (err) logError(err)
                else {
                  log("Relay is " + stdout.trim())
                }
              })
            } else {
              exec("python monitor.py -r=0 -g=" + this.config.gpio, { cwd: this.PathScript }, (err, stdout, stderr) => {
                if (err) logError(err)
                else {
                  log("Relay is " + stdout.trim())
                }
              })
            }
          } else {
            exec("python monitor.py -r=1 -g=" + this.config.gpio, { cwd: this.PathScript }, (err, stdout, stderr) => {
              if (err) logError(err)
              else log("Relay is " + stdout.trim())
            })
          }
          break
        case 8:
          if (set) exec("ddcutil setvcp d6 1")
          else exec("ddcutil setvcp d6 4")
          break
        case 9:
          if (set) exec(`xrandr --output ${this.screen.hdmiPort} --auto --rotate ${this.screen.xrandrRotation}`)
          else exec(`xrandr --output ${this.screen.hdmiPort} --off`)
          break
        case 10:
          if (set) exec(`WAYLAND_DISPLAY=wayland-1 wlr-randr --output ${this.screen.hdmiPort} --on --transform ${this.screen.wrandrRotation}`)
          else exec(`WAYLAND_DISPLAY=wayland-1 wlr-randr --output ${this.screen.hdmiPort} --off`)
          break
        case 11:
          if (set) {
            // Turn ON using HDMI CEC
            exec("echo 'on 0' | cec-client -s -d 1")
          } else {
            // Toggle GPIO to turn off display
            exec("python monitor.py -t -g=" + this.config.gpio, { cwd: this.PathScript }, (err, stdout, stderr) => {
              if (err) this.logError(err)
              else log("Relay toggled: " + stdout.trim())
            })
          }
          break
      }
      if (command) {
        await this._execPromise(command);
      }
    } catch (err) {
      this.logError(err);
    }
  }

  sendNotification(notification, payload) {
    try {
      this.sendSocketNotification(notification, payload);
    } catch (err) {
      this.logError(`Failed to send notification ${notification}: ${err.message}`);
    }
  }

  state() {
    this.sendSocketNotification("SCREEN_STATE", this.screen)
  }

  SendScreenPowerState() {
    this.sendSocketNotification("SCREEN_POWER", this.screen.power)
  }

  logError(err) {
    const errorMessage = err instanceof Error ? err.message : err.toString();
    console.error("[MMM-Pir] [LIB] [SCREEN]", errorMessage);
    this.sendNotification("SCREEN_ERROR", errorMessage);
  }
}

module.exports = SCREEN
