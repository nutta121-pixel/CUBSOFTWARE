const { DatabaseUtils } = require('./utils');
const { db } = require('./schema');
const cron = require('node-cron');

class DatabaseMaintenance {
    static start() {
        cron.schedule('0 3 * * *', () => {
            console.log('Running daily database maintenance...');

            if (DatabaseUtils.checkIntegrity()) {
                console.log('Database integrity check passed');
            } else {
                console.error('Database integrity check FAILED! Manual intervention required.');
            }

            DatabaseUtils.createBackup();
            DatabaseUtils.optimize();

            console.log('Database maintenance completed');
        });

        cron.schedule('0 */6 * * *', () => {
            console.log('Running periodic database optimization...');
            DatabaseUtils.optimize();
        });

        // Clean up expired solitary confinements every minute
        cron.schedule('* * * * *', () => {
            this.cleanupExpiredConfinements();
        });

        console.log('Database maintenance scheduler started');
    }

    static cleanupExpiredConfinements() {
        try {
            const now = Math.floor(Date.now() / 1000);

            const result = db.prepare(`
                UPDATE solitary_confinement
                SET active = 0
                WHERE active = 1 AND expires_at <= ?
            `).run(now);

            if (result.changes > 0) {
                console.log(`[Confinement Cleanup] Deactivated ${result.changes} expired confinement(s)`);
            }
        } catch (error) {
            console.error('Error cleaning up expired confinements:', error);
        }
    }

    static runManualMaintenance() {
        console.log('Running manual database maintenance...');

        const integrityOk = DatabaseUtils.checkIntegrity();
        const backupPath = DatabaseUtils.createBackup();
        const optimized = DatabaseUtils.optimize();
        DatabaseUtils.vacuum();

        return {
            integrityCheck: integrityOk,
            backup: backupPath,
            optimized: optimized,
            stats: DatabaseUtils.getStats()
        };
    }
}

module.exports = { DatabaseMaintenance };
