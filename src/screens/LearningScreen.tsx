import { LearningManager } from '../services/LearningManager';

export const LearningScreen = () => {
  const [todayWords, setTodayWords] = useState([]);
  const learningManager = new LearningManager();

  useEffect(() => {
    async function loadTodayLearning() {
      const { newWords, reviewWords } = await learningManager.getTodayLearningList();
      setTodayWords([...newWords, ...reviewWords]);
    }
    loadTodayLearning();
  }, []);

  // ... 渲染学习界面
}; 