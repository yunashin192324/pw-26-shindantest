import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { AboutPage } from './pages/AboutPage';
import { AutomationPage } from './pages/AutomationPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { ChapterPage } from './pages/ChapterPage';
import { ComparisonPage } from './pages/ComparisonPage';
import { CoveragePage } from './pages/CoveragePage';
import { FeaturePage } from './pages/FeaturePage';
import { FeaturesPage } from './pages/FeaturesPage';
import { FileFormatsPage } from './pages/FileFormatsPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProductPage } from './pages/ProductPage';
import { QualityPage } from './pages/QualityPage';
import { SearchPage } from './pages/SearchPage';
import { SourcesPage } from './pages/SourcesPage';
import { WorkflowPage } from './pages/WorkflowPage';
import { useRoute, type Route } from './utils/navigation';

function renderPage(route: Route) {
  const [head, id] = route.segments;
  switch (head) {
    case undefined:
      return <HomePage />;
    case 'features':
      return <FeaturesPage route={route} />;
    case 'feature':
      return <FeaturePage id={id ?? ''} />;
    case 'product':
      return <ProductPage id={id ?? ''} />;
    case 'chapter':
      return <ChapterPage id={id ?? ''} />;
    case 'search':
      return <SearchPage route={route} />;
    case 'compare':
      return <ComparisonPage route={route} />;
    case 'formats':
      return <FileFormatsPage />;
    case 'automation':
      return <AutomationPage />;
    case 'workflow':
      return <WorkflowPage />;
    case 'quality':
      return <QualityPage />;
    case 'bookmarks':
      return <BookmarksPage />;
    case 'sources':
      return <SourcesPage />;
    case 'coverage':
      return <CoveragePage />;
    case 'about':
      return <AboutPage />;
    default:
      return <NotFoundPage />;
  }
}

/** ?at=要素ID が指定されていれば、その位置へ移動して強調する。なければページ先頭へ。 */
function useAnchorScroll(route: Route) {
  const at = route.query.get('at');
  useEffect(() => {
    if (!at) {
      window.scrollTo(0, 0);
      return;
    }
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(at);
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    });
    return () => cancelAnimationFrame(raf);
  }, [route.path, at]);
}

export function App() {
  const route = useRoute();
  useAnchorScroll(route);
  return <Layout route={route}>{renderPage(route)}</Layout>;
}
