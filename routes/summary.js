import { Router } from 'express';
const router = Router();

export default function summaryRoutes(db, cache, cacheKey, invalidate) {
  router.get('/dashboard', async (req, res) => {
    try {
      const key = cacheKey('dashboard-summary', req.userId);

      if (cache.has(key)) {
        return res.json(cache.get(key));
      }

      const userId = req.userId;

      const [classes, budgetEntries, plannerTasks, wellnessStats, studySessions] = await Promise.all([
        db.collection('classes')
          .find({ userId })
          .sort({ dayIndex: 1, startTime: 1 })
          .toArray(),
        db.collection('budget')
          .find({ userId })
          .sort({ date: -1 })
          .toArray(),
        db.collection('planner')
          .find({ userId })
          .sort({ dueDate: 1 })
          .toArray(),
        db.collection('wellness')
          .find({ userId })
          .sort({ date: -1 })
          .limit(7)
          .toArray(),
        db.collection('study_sessions')
          .find({ userId })
          .sort({ date: -1 })
          .toArray()
      ]);

      const today = new Date();
      const todayIndex = today.getDay(); // 0=Sun ... 6=Sat
      const nowMinutes = today.getHours() * 60 + today.getMinutes();

      const dayNameToIndex = (val) => {
        if (val === null || val === undefined) return null;
        
        const s = String(val || '').trim().toLowerCase();
        const map = {
          sun: 0, sunday: 0,
          mon: 1, monday: 1,
          tue: 2, tuesday: 2,
          wed: 3, wednesday: 3,
          thu: 4, thursday: 4,
          fri: 5, friday: 5,
          sat: 6, saturday: 6
        };
        
        if (map[s] !== undefined) return map[s];
        if (s.length >= 3 && map[s.slice(0, 3)] !== undefined) return map[s.slice(0, 3)];
        return null;
      };

      const parseTimeToMinutes = (t) => {
        if (typeof t !== 'string') return null;
        const m = t.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
        if (!m) return null;
        let hh = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        const mer = m[3];
        if (mer) {
          if (mer === 'pm' && hh !== 12) hh += 12;
          if (mer === 'am' && hh === 12) hh = 0;
        }
        return hh * 60 + mm;
      };

      // FIXED: Handle both dayIndex and day fields properly
      const todayClasses = classes.filter(cls => {
        // First try to use dayIndex if available and valid
        if (typeof cls.dayIndex === 'number' && cls.dayIndex >= 0 && cls.dayIndex <= 6) {
          return cls.dayIndex === todayIndex;
        }
        
        // If dayIndex is not available or invalid, try to use day field
        if (cls.day) {
          const idx = dayNameToIndex(cls.day);
          return idx !== null && idx === todayIndex;
        }
        
        return false;
      });

      const upcomingTodayClasses = todayClasses
        .map(c => ({ 
          ...c, 
          _start: parseTimeToMinutes(c.startTime) 
        }))
        .filter(c => c._start !== null && c._start > nowMinutes)
        .sort((a, b) => a._start - b._start);

      const classSummary = {
        total: classes.length,
        todayClasses: todayClasses,
        nextClass: upcomingTodayClasses.length > 0 ? upcomingTodayClasses[0] : null
      };

      // budget data
      const budgetSummary = {
        totalIncome: budgetEntries
          .filter(entry => entry.type === 'income')
          .reduce((sum, entry) => sum + (entry.amount || 0), 0),
        totalExpenses: budgetEntries
          .filter(entry => entry.type === 'expense')
          .reduce((sum, entry) => sum + (entry.amount || 0), 0),
        recentTransactions: budgetEntries.slice(0, 5),
        balance: 0
      };
      budgetSummary.balance = budgetSummary.totalIncome - budgetSummary.totalExpenses;

      const expensesByCategory = budgetEntries
        .filter(entry => entry.type === 'expense')
        .reduce((acc, entry) => {
          const category = entry.category || 'Uncategorized';
          acc[category] = (acc[category] || 0) + (entry.amount || 0);
          return acc;
        }, {});

      // planner data
      const plannerSummary = {
        totalTasks: plannerTasks.length,
        completedTasks: plannerTasks.filter(task => task.status === 'completed').length,
        pendingTasks: plannerTasks.filter(task => task.status !== 'completed').length,
        highPriorityTasks: plannerTasks.filter(task =>
          task.priority === 'high' && task.status !== 'completed'
        ).length,
        overdueTasks: plannerTasks.filter(task =>
          task.dueDate && new Date(task.dueDate) < today && task.status !== 'completed'
        ).length,
        upcomingTasks: plannerTasks
          .filter(task => task.status !== 'completed')
          .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0))
          .slice(0, 5)
      };

      // wellness data
      const wellnessSummary = {
        totalEntries: wellnessStats.length,
        averageMood: wellnessStats.length > 0
          ? wellnessStats.reduce((sum, entry) => sum + (entry.mood || 0), 0) / wellnessStats.length
          : 0,
        sleepHours: wellnessStats.length > 0
          ? wellnessStats.reduce((sum, entry) => sum + (entry.sleepHours || 0), 0) / wellnessStats.length
          : 0,
        studyHours: wellnessStats.length > 0
          ? wellnessStats.reduce((sum, entry) => sum + (entry.studyHours || 0), 0) / wellnessStats.length
          : 0,
        lastEntry: wellnessStats[0] || null
      };

      // weekly data
      const oneWeekAgo = new Date(today);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const weeklyStudyHours = studySessions
        .filter(session => new Date(session.date) >= oneWeekAgo)
        .reduce((sum, session) => sum + (session.duration || 0), 0);

      const weeklyExpenseData = budgetEntries
        .filter(entry =>
          entry.type === 'expense' &&
          entry.date &&
          new Date(entry.date) >= oneWeekAgo
        )
        .reduce((acc, entry) => {
          const dateStr = new Date(entry.date).toISOString().split('T')[0];
          acc[dateStr] = (acc[dateStr] || 0) + (entry.amount || 0);
          return acc;
        }, {});

      // dashboard summary
      const dashboardSummary = {
        classes: classSummary,
        budget: budgetSummary,
        expensesByCategory,
        planner: plannerSummary,
        wellness: wellnessSummary,
        weeklyData: {
          studySessions: studySessions.filter(session => new Date(session.date) >= oneWeekAgo),
          expenses: weeklyExpenseData
        },
        quickStats: {
          totalClasses: classSummary.total,
          balance: budgetSummary.balance,
          pendingTasks: plannerSummary.pendingTasks,
          studyHoursThisWeek: weeklyStudyHours
        },
        timestamp: new Date()
      };
      
      cache.set(key, dashboardSummary, 300);
      res.json(dashboardSummary);

    } catch (error) {
      console.error('Error fetching dashboard summary:', error);
      res.status(500).json({
        message: 'Error fetching dashboard data',
        error: error.message
      });
    }
  });

  // Temporary route to fix dayIndex in existing classes
  router.post('/fix-day-indexes', async (req, res) => {
    try {
      const classes = await db.collection('classes')
        .find({ userId: req.userId })
        .toArray();
      
      const updateOperations = [];
      
      for (const cls of classes) {
        let dayIndex = cls.dayIndex;
        
        // যদি dayIndex valid number না হয়, তাহলে day ফিল্ড থেকে calculate করুন
        if (typeof dayIndex !== 'number' || dayIndex < 0 || dayIndex > 6) {
          dayIndex = dayNameToIndex(cls.day);
        }
        
        // যদি dayIndex valid হয়, তাহলে update operation add করুন
        if (dayIndex !== null && dayIndex >= 0 && dayIndex <= 6) {
          updateOperations.push({
            updateOne: {
              filter: { _id: cls._id },
              update: { $set: { dayIndex: dayIndex } }
            }
          });
        }
      }
      
      if (updateOperations.length > 0) {
        const result = await db.collection('classes').bulkWrite(updateOperations);
        console.log(`Updated ${result.modifiedCount} classes with dayIndex`);
      }
      
      res.json({ 
        message: `Processed ${classes.length} classes, updated ${updateOperations.length} with dayIndex`,
        details: `Found ${classes.length} total classes in database`
      });
      
    } catch (error) {
      console.error('Error fixing day indexes:', error);
      res.status(500).json({ 
        message: 'Error fixing day indexes',
        error: error.message 
      });
    }
  });

  // Debug route to check class data
  router.get('/debug-classes', async (req, res) => {
    try {
      const classes = await db.collection('classes')
        .find({ userId: req.userId })
        .toArray();
      
      const today = new Date();
      const todayIndex = today.getDay();
      
      const classData = classes.map(cls => ({
        _id: cls._id,
        subject: cls.subject,
        day: cls.day,
        dayIndex: cls.dayIndex,
        startTime: cls.startTime,
        isValidDayIndex: typeof cls.dayIndex === 'number' && cls.dayIndex >= 0 && cls.dayIndex <= 6,
        matchesToday: typeof cls.dayIndex === 'number' ? cls.dayIndex === todayIndex : null
      }));
      
      res.json({
        todayIndex,
        todayDayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][todayIndex],
        totalClasses: classes.length,
        classes: classData
      });
      
    } catch (error) {
      console.error('Error debugging classes:', error);
      res.status(500).json({ message: 'Error debugging classes' });
    }
  });

  // study session
  router.post('/study-session', async (req, res) => {
    try {
      const { subject, duration, topic, efficiency } = req.body;

      const newSession = {
        userId: req.userId,
        subject: String(subject).trim(),
        duration: Number(duration),
        topic: topic ? String(topic).trim() : '',
        efficiency: efficiency ? Number(efficiency) : 0,
        date: new Date(),
        createdAt: new Date()
      };

      const result = await db.collection('study_sessions').insertOne(newSession);
      invalidate('dashboard-summary', req.userId);

      res.status(201).json({
        ...newSession,
        _id: result.insertedId,
        message: 'Study session recorded successfully'
      });
    } catch (error) {
      console.error('Error recording study session:', error);
      res.status(500).json({
        message: 'Error recording study session',
        error: error.message
      });
    }
  });
  
  // record mood/wellness entry
  router.post('/mood-track', async (req, res) => {
    try {
      const { mood, sleepHours, studyHours, notes } = req.body;

      const wellnessEntry = {
        userId: req.userId,
        mood: Number(mood),
        sleepHours: sleepHours ? Number(sleepHours) : 0,
        studyHours: studyHours ? Number(studyHours) : 0,
        notes: notes ? String(notes).trim() : '',
        date: new Date(),
        createdAt: new Date()
      };

      const result = await db.collection('wellness').insertOne(wellnessEntry);
      invalidate('dashboard-summary', req.userId);

      res.status(201).json({
        ...wellnessEntry,
        _id: result.insertedId,
        message: 'Wellness entry recorded successfully'
      });

    } catch (error) {
      console.error('Error recording wellness entry:', error);
      res.status(500).json({
        message: 'Error recording wellness entry',
        error: error.message
      });
    }
  });

  // Wellness history route
  router.get('/wellness-history', async (req, res) => {
    try {
      const wellnessHistory = await db.collection('wellness')
        .find({ userId: req.userId })
        .sort({ date: -1 })
        .limit(30)
        .toArray();
      res.json(wellnessHistory);
    } catch (error) {
      console.error('Error fetching wellness history:', error);
      res.status(500).json({ message: 'Error fetching wellness history' });
    }
  });

  // Study history route
  router.get('/study-history', async (req, res) => {
    try {
      const studyHistory = await db.collection('study_sessions')
        .find({ userId: req.userId })
        .sort({ date: -1 })
        .limit(30)
        .toArray();
      res.json(studyHistory);
    } catch (error) {
      console.error('Error fetching study history:', error);
      res.status(500).json({ message: 'Error fetching study history' });
    }
  });
  
  return router;
}