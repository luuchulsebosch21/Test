import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Portfolio from './pages/Portfolio';
import Favorites from './pages/Favorites';
import Transactions from './pages/Transactions';
import { useDarkMode } from './hooks/useDarkMode';

export default function App() {
  const { darkMode, toggleDarkMode } = useDarkMode();

  return (
    <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode}>
      <Routes>
        <Route path="/" element={<Portfolio />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/transactions" element={<Transactions />} />
      </Routes>
    </Layout>
  );
}
