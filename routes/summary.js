import { Router } from 'express';
import { ObjectId } from 'mongodb';

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
      const todayDay = today.toLocaleDateString('en-US', { weekday: 'short' });
      const currentTime = today.toTimeString().substring(0, 5);

      // classes data
      const classSummary = {
        total: classes.length,
        todayClasses: classes.filter(cls => 
          cls.day && cls.day.toLowerCase() === todayDay.toLowerCase()
        ),
        nextClass: null
      };

      const upcomingTodayClasses = classSummary.todayClasses
        .filter(cls => cls.startTime > currentTime)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      classSummary.nextClass = upcomingTodayClasses.length > 0 ? upcomingTodayClasses[0] : null;

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

  // get study goal
  router.get('/study-goals', async (req, res) => {
    try {
      const key = cacheKey('study-goals', req.userId);
      
      if (cache.has(key)) {
        return res.json(cache.get(key));
      }

      const goals = await db.collection('study_goals')
        .find({ userId: req.userId })
        .sort({ targetDate: 1 })
        .toArray();

      cache.set(key, goals, 60);
      res.json(goals);

    } catch (error) {
      console.error('Error fetching study goals:', error);
      res.status(500).json({ 
        message: 'Error fetching study goals',
        error: error.message 
      });
    }
  });

  // study goal
  router.post('/study-goals', async (req, res) => {
    try {
      const { title, targetDate, targetHours, subject } = req.body;
      
      const newGoal = {
        userId: req.userId,
        title: String(title).trim(),
        targetDate: new Date(targetDate),
        targetHours: Number(targetHours),
        subject: subject ? String(subject).trim() : '',
        completed: false,
        progress: 0,
        createdAt: new Date()
      };

      const result = await db.collection('study_goals').insertOne(newGoal);
      
      invalidate('study-goals', req.userId);
      invalidate('dashboard-summary', req.userId);

      res.status(201).json({ 
        ...newGoal, 
        _id: result.insertedId,
        message: 'Study goal created successfully'
      });

    } catch (error) {
      console.error('Error creating study goal:', error);
      res.status(500).json({ 
        message: 'Error creating study goal',
        error: error.message 
      });
    }
  });

  return router;
}