
module.exports = class Debug {
    start() {
        // this.hrtime = process.hrtime();
        this.time = Date.now();
        return this;
    }

    stop() {
        // return process.hrtime(this.hrtime)[1] / 1e6;
        return Date.now() - this.time;
    }
}
