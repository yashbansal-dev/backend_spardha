const os = require('os');

/**
 * Get overall summary statistics
 */
async function getSummaryStats() {
    const [totalUsers, totalRevenue, totalEntries] = await Promise.all([
        User.countDocuments({ isAdmin: false }),
        Purchase.aggregate([
            { $match: { paymentStatus: 'completed' } },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } }
        ]),
        User.countDocuments({ hasEntered: true })
    ]);

    return {
        totalUsers,
        totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
        totalEntries,
        avgTicketValue: totalUsers > 0 ? ((totalRevenue[0]?.total || 0) / totalUsers).toFixed(2) : 0
    };
}

/**
 * Get registration breakdown by event
 */
async function getEventAnalytics() {
    const events = await Event.find({}, 'name price');
    const breakdown = [];

    for (const event of events) {
        const [regCount, entryCount] = await Promise.all([
            User.countDocuments({ events: event.name }),
            User.countDocuments({ events: event.name, hasEntered: true })
        ]);

        breakdown.push({
            name: event.name,
            registrations: regCount,
            entries: entryCount,
            entryRate: regCount > 0 ? ((entryCount / regCount) * 100).toFixed(1) : 0,
            revenue: regCount * event.price
        });
    }

    return breakdown.sort((a, b) => b.registrations - a.registrations);
}

/**
 * Get registration timeline for the last 10 days
 */
async function getRegistrationTimeline() {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    return await User.aggregate([
        { $match: { createdAt: { $gte: tenDaysAgo } } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                count: { $sum: 1 }
            }
        },
        { $sort: { "_id": 1 } }
    ]);
}

/**
 * Get university participation breakdown
 */
async function getUniversityStats() {
    return await User.aggregate([
        { $match: { universityName: { $exists: true, $ne: "" } } },
        {
            $group: {
                _id: "$universityName",
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);
}

/**
 * Get System Vitals (CPU, RAM, Uptime)
 */
async function getSystemVitals() {
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);

    return {
        uptime: Math.floor(process.uptime()),
        memoryUsage: `${memUsage}%`,
        cpuLoad: os.loadavg(),
        nodeVersion: process.version,
        platform: os.platform(),
        timestamp: new Date()
    };
}

/**
 * Get Detailed Demographic breakdown
 */
async function getDetailedDemographics() {
    const [genderData, ageData] = await Promise.all([
        User.aggregate([
            { $group: { _id: "$gender", count: { $sum: 1 } } }
        ]),
        User.aggregate([
            {
                $bucket: {
                    groupBy: "$age",
                    boundaries: [0, 18, 21, 25, 30, 100],
                    default: "Other",
                    output: { count: { $sum: 1 } }
                }
            }
        ])
    ]);

    return { genderData, ageData };
}

/**
 * Get live activity feed (latest events)
 */
async function getActivityFeed() {
    const latestUsers = await User.find({ isAdmin: false })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('name email createdAt');

    const latestEntries = await User.find({ hasEntered: true })
        .sort({ entryTime: -1 })
        .limit(10)
        .select('name email entryTime');

    const latestPayments = await Purchase.find({ paymentStatus: 'completed' })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('userDetails.name totalAmount updatedAt');

    const feed = [
        ...latestUsers.map(u => ({ type: 'registration', name: u.name, time: u.createdAt })),
        ...latestEntries.map(e => ({ type: 'entry', name: e.name, time: e.entryTime })),
        ...latestPayments.map(p => ({ type: 'payment', name: p.userDetails?.name, amount: p.totalAmount, time: p.updatedAt }))
    ];

    return feed.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 20);
}

/**
 * Get Payment conversion health
 */
async function getPaymentHealth() {
    const stats = await Purchase.aggregate([
        {
            $group: {
                _id: "$paymentStatus",
                count: { $sum: 1 },
                totalAmount: { $sum: "$totalAmount" }
            }
        }
    ]);

    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const completed = stats.find(s => s._id === 'completed')?.count || 0;

    return {
        stats,
        conversionRate: total > 0 ? ((completed / total) * 100).toFixed(1) : 0
    };
}

module.exports = {
    getSummaryStats,
    getEventAnalytics,
    getRegistrationTimeline,
    getUniversityStats,
    getSystemVitals,
    getDetailedDemographics,
    getActivityFeed,
    getPaymentHealth
};
