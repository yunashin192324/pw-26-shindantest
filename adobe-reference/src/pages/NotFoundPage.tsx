import { EmptyState, Link } from '../components/common';

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState title="ページが見つかりません">
        <p>
          指定されたページは存在しません。<Link to="/">ホーム</Link>または<Link to="/features">全機能一覧</Link>から探してください。
        </p>
      </EmptyState>
    </div>
  );
}
