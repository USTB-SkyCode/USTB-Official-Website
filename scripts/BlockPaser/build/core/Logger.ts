
export class Logger {
    private static startTime: number = Date.now();
    private static totalSteps: number = 0;
    private static currentStep: number = 0;

    static info(message: string) {
        process.stdout.write(`\x1b[36m[INFO]\x1b[0m ${message}\n`);
    }

    static success(message: string) {
        process.stdout.write(`\x1b[32m[SUCCESS]\x1b[0m ${message}\n`);
    }

    static warn(message: string) {
        process.stdout.write(`\x1b[33m[WARN]\x1b[0m ${message}\n`);
    }

    static error(message: string, error?: any) {
        process.stdout.write(`\x1b[31m[ERROR]\x1b[0m ${message}\n`);
        if (error) console.error(error);
    }

    static debug(message: string) {
        // Commented out debug output
        // process.stdout.write(`\x1b[90m[DEBUG]\x1b[0m ${message}\n`);
    }

    static step(stepName: string) {
        this.currentStep++;
        process.stdout.write(`\n\x1b[1m\x1b[34m==> Step ${this.currentStep}: ${stepName}\x1b[0m\n`);
    }

    static progress(current: number, total: number, message: string = '') {
        const percentage = Math.round((current / total) * 100);
        const barLength = 20; // Reduced from 30 to fit smaller terminals
        const filledLength = Math.round((barLength * percentage) / 100);
        const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

        // Truncate message to avoid wrapping on standard terminals (e.g. 80 cols)
        // 80 - 20 (bar) - 8 (percent) - 15 (count) - 5 (padding) ~ 32 chars
        let displayMsg = message;
        if (displayMsg.length > 30) {
            displayMsg = displayMsg.substring(0, 27) + '...';
        }

        process.stdout.write(`\r\x1b[K${bar} ${percentage}% | ${current}/${total} | ${displayMsg}`);

        if (current === total) {
            process.stdout.write('\n');
        }
    }
}
