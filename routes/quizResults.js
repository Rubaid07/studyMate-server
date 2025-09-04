import { Router } from 'express';
import { ObjectId } from 'mongodb';
const router = Router();

export default function quizResultsRoutes(db, cache, cacheKey, invalidate) {
  // Performance rating calculation function
  const getPerformanceRating = (percentage) => {
    if (percentage >= 90) return { rating: 'Excellent', color: 'text-green-800', bgColor: 'bg-green-100' };
    if (percentage >= 80) return { rating: 'Very Good', color: 'text-green-700', bgColor: 'bg-green-50' };
    if (percentage >= 70) return { rating: 'Good', color: 'text-blue-700', bgColor: 'bg-blue-50' };
    if (percentage >= 60) return { rating: 'Average', color: 'text-yellow-700', bgColor: 'bg-yellow-50' };
    if (percentage >= 50) return { rating: 'Below Average', color: 'text-orange-700', bgColor: 'bg-orange-50' };
    return { rating: 'Needs Improvement', color: 'text-red-700', bgColor: 'bg-red-50' };
  };

  // Calculate performance insights
  const calculatePerformanceInsights = (results) => {
    if (results.length === 0) return null;
    
    const totalQuizzes = results.length;
    const totalScore = results.reduce((sum, result) => sum + result.percentage, 0);
    const averageScore = Math.round(totalScore / totalQuizzes);
    
    const bestResult = results.reduce((best, current) => 
      current.percentage > best.percentage ? current : best, results[0]);
    
    const worstResult = results.reduce((worst, current) => 
      current.percentage < worst.percentage ? current : worst, results[0]);
    
    // Calculate improvement trend (last 5 quizzes vs previous 5)
    const recentQuizzes = results.slice(0, 5);
    const previousQuizzes = results.slice(5, 10);
    
    const recentAverage = recentQuizzes.length > 0 ? 
      Math.round(recentQuizzes.reduce((sum, quiz) => sum + quiz.percentage, 0) / recentQuizzes.length) : 0;
    
    const previousAverage = previousQuizzes.length > 0 ? 
      Math.round(previousQuizzes.reduce((sum, quiz) => sum + quiz.percentage, 0) / previousQuizzes.length) : 0;
    
    const improvement = recentAverage - previousAverage;
    let trend = 'stable';
    
    if (improvement > 5) trend = 'improving';
    else if (improvement < -5) trend = 'declining';
    
    // Calculate success rate by difficulty
    const difficultyStats = {};
    results.forEach(result => {
      const difficulty = result.difficulty || 'medium';
      if (!difficultyStats[difficulty]) {
        difficultyStats[difficulty] = { total: 0, totalScore: 0, average: 0 };
      }
      difficultyStats[difficulty].total += 1;
      difficultyStats[difficulty].totalScore += result.percentage;
    });
    
    Object.keys(difficultyStats).forEach(diff => {
      difficultyStats[diff].average = Math.round(difficultyStats[diff].totalScore / difficultyStats[diff].total);
    });
    
    // Calculate consistency (standard deviation)
    const variance = results.reduce((sum, result) => {
      return sum + Math.pow(result.percentage - averageScore, 2);
    }, 0) / results.length;
    
    const consistency = Math.round(100 - (Math.sqrt(variance) / 2));
    
    return {
      overallRating: getPerformanceRating(averageScore),
      averageScore,
      bestScore: bestResult.percentage,
      worstScore: worstResult.percentage,
      totalQuizzes,
      improvement: {
        value: improvement,
        trend,
        recentAverage,
        previousAverage
      },
      difficultyStats,
      consistency,
      streak: calculateStreak(results)
    };
  };

  // Calculate current streak
  const calculateStreak = (results) => {
    if (results.length === 0) return 0;
    
    let streak = 0;
    const today = new Date();
    const sortedResults = [...results].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    for (const result of sortedResults) {
      const resultDate = new Date(result.date);
      const dayDiff = Math.floor((today - resultDate) / (1000 * 60 * 60 * 24));
      
      if (dayDiff > streak + 1) break; // Gap in days, streak broken
      if (result.percentage >= 60) streak++;
      else break;
    }
    
    return streak;
  };

  // Save quiz result
  router.post('/results', async (req, res) => {
    try {
      const { topic, score, totalQuestions, percentage, type, difficulty, timeSpent } = req.body;
      
      const quizResult = {
        userId: req.userId,
        topic: String(topic || '').trim(),
        score: Number(score),
        totalQuestions: Number(totalQuestions),
        percentage: Number(percentage),
        type: String(type || '').trim(),
        difficulty: String(difficulty || 'medium').trim(),
        timeSpent: Number(timeSpent) || 0,
        date: new Date(),
        createdAt: new Date(),
        performanceRating: getPerformanceRating(percentage)
      };

      const result = await db.collection('quiz_results').insertOne(quizResult);
      
      // Invalidate cache
      invalidate('quiz-stats', req.userId);
      invalidate('dashboard-summary', req.userId);
      invalidate('quiz-performance', req.userId);
      
      res.status(201).json({ 
        message: 'Quiz result saved successfully',
        id: result.insertedId,
        performanceRating: quizResult.performanceRating
      });
    } catch (error) {
      console.error('Error saving quiz result:', error);
      res.status(500).json({ 
        message: 'Error saving quiz result', 
        error: error.message 
      });
    }
  });

  // Get comprehensive quiz performance analysis
  router.get('/results/performance', async (req, res) => {
    try {
      const userId = req.userId;
      const key = cacheKey('quiz-performance', userId);

      // Check cache first
      if (cache.has(key)) {
        return res.json(cache.get(key));
      }

      // Get all quiz results
      const allResults = await db.collection('quiz_results')
        .find({ userId })
        .sort({ date: -1 })
        .toArray();

      if (allResults.length === 0) {
        return res.json({
          message: 'No quiz results found',
          hasData: false,
          overallRating: getPerformanceRating(0),
          averageScore: 0,
          totalQuizzes: 0
        });
      }

      // Calculate performance insights
      const performanceInsights = calculatePerformanceInsights(allResults);

      // Get recent results (last 5 with performance rating)
      const recentResults = allResults.slice(0, 5).map(result => ({
        ...result,
        performanceRating: getPerformanceRating(result.percentage)
      }));

      // Get subject-wise performance
      const subjectPerformance = allResults.reduce((acc, result) => {
        const subject = result.topic || 'Unknown';
        if (!acc[subject]) {
          acc[subject] = { total: 0, totalScore: 0, average: 0, quizzes: [] };
        }
        acc[subject].total += 1;
        acc[subject].totalScore += result.percentage;
        acc[subject].average = Math.round(acc[subject].totalScore / acc[subject].total);
        acc[subject].quizzes.push({
          score: result.percentage,
          date: result.date,
          performanceRating: getPerformanceRating(result.percentage)
        });
        return acc;
      }, {});

      // Transform subject performance for better frontend consumption
      const subjectStats = Object.entries(subjectPerformance)
        .map(([subject, data]) => ({
          subject,
          totalQuizzes: data.total,
          averageScore: data.average,
          performanceRating: getPerformanceRating(data.average),
          bestScore: Math.max(...data.quizzes.map(q => q.score)),
          worstScore: Math.min(...data.quizzes.map(q => q.score)),
          trend: data.quizzes.slice(0, 3).map(q => q.score) // Last 3 scores for trend
        }))
        .sort((a, b) => b.averageScore - a.averageScore);

      const response = {
        hasData: true,
        recentResults,
        performanceInsights,
        subjectPerformance: subjectStats,
        totalQuizzes: allResults.length,
        timeSpentTotal: allResults.reduce((sum, result) => sum + (result.timeSpent || 0), 0),
        consistency: performanceInsights.consistency
      };

      // Cache for 10 minutes
      cache.set(key, response, 600);
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching quiz performance:', error);
      res.status(500).json({ 
        message: 'Error fetching quiz performance', 
        error: error.message 
      });
    }
  });

  // Get quiz results summary for dashboard (simplified version)
  router.get('/results/summary', async (req, res) => {
    try {
      const userId = req.userId;
      const key = cacheKey('quiz-stats', userId);

      // Check cache first
      if (cache.has(key)) {
        return res.json(cache.get(key));
      }

      // Get recent results (last 5)
      const recentResults = await db.collection('quiz_results')
        .find({ userId })
        .sort({ date: -1 })
        .limit(5)
        .toArray();

      // Add performance rating to recent results
      const recentResultsWithRating = recentResults.map(result => ({
        ...result,
        performanceRating: getPerformanceRating(result.percentage)
      }));

      // Get all results for stats
      const allResults = await db.collection('quiz_results')
        .find({ userId })
        .toArray();

      const totalQuizzes = allResults.length;
      
      const averageScore = totalQuizzes > 0 
        ? Math.round(allResults.reduce((sum, result) => sum + result.percentage, 0) / totalQuizzes)
        : 0;
      
      const bestScore = totalQuizzes > 0
        ? Math.max(...allResults.map(result => result.percentage))
        : 0;

      const currentStreak = calculateStreak(allResults);

      const response = {
        recentResults: recentResultsWithRating,
        stats: {
          totalQuizzes,
          averageScore,
          bestScore,
          currentStreak,
          overallRating: getPerformanceRating(averageScore)
        }
      };

      // Cache for 5 minutes
      cache.set(key, response, 300);
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching quiz results:', error);
      res.status(500).json({ 
        message: 'Error fetching quiz results', 
        error: error.message 
      });
    }
  });

  // Get full quiz history with performance ratings
  router.get('/results/history', async (req, res) => {
    try {
      const { limit = 20, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const quizHistory = await db.collection('quiz_results')
        .find({ userId: req.userId })
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      // Add performance ratings
      const quizHistoryWithRatings = quizHistory.map(result => ({
        ...result,
        performanceRating: getPerformanceRating(result.percentage)
      }));

      const totalCount = await db.collection('quiz_results')
        .countDocuments({ userId: req.userId });

      res.json({
        results: quizHistoryWithRatings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching quiz history:', error);
      res.status(500).json({ 
        message: 'Error fetching quiz history', 
        error: error.message 
      });
    }
  });

  // Delete quiz result
  router.delete('/results/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid quiz result ID' });
      }

      const result = await db.collection('quiz_results').deleteOne({
        _id: new ObjectId(id),
        userId: req.userId
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ message: 'Quiz result not found' });
      }

      // Invalidate cache
      invalidate('quiz-stats', req.userId);
      invalidate('dashboard-summary', req.userId);
      invalidate('quiz-performance', req.userId);

      res.json({ message: 'Quiz result deleted successfully' });
    } catch (error) {
      console.error('Error deleting quiz result:', error);
      res.status(500).json({ 
        message: 'Error deleting quiz result', 
        error: error.message 
      });
    }
  });

  return router;
}