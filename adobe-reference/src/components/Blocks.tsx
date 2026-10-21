import type { SectionBlock } from '../data/types';
import { Link, NotRecorded, ProvenanceBadge } from './common';

export function FlowDiagram({ block }: { block: Extract<SectionBlock, { kind: 'flow' }> }) {
  return (
    <figure className="flow" id={block.id}>
      <figcaption>
        <span className="block-title">図：{block.title}</span> <ProvenanceBadge kind={block.provenance} compact />
      </figcaption>
      <ol className="flow-steps" aria-label={`${block.title}（図）`}>
        {block.steps.map((s, i) => (
          <li key={i} className="flow-step">
            <span className="flow-num">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {/* 図と同じ内容を文章でも示す */}
      <p className="flow-text">
        文章での表記：{block.steps.join(' → ')}
      </p>
      {block.caption && <p className="caption">{block.caption}</p>}
    </figure>
  );
}

export function DataTable({ block }: { block: Extract<SectionBlock, { kind: 'table' }> }) {
  return (
    <figure className="table-figure" id={block.id}>
      <figcaption>
        <span className="block-title">表：{block.title}</span> <ProvenanceBadge kind={block.provenance} compact />
      </figcaption>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={`${block.title}（横にスクロールできます）`}>
        <table>
          <thead>
            <tr>
              {block.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.link ? <Link to={row.link}>{row.key}</Link> : row.key}</th>
                {row.cells.map((cell, i) => (
                  <td key={i}>{cell ?? <NotRecorded reason="元資料未提供" />}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption && <p className="caption">{block.caption}</p>}
    </figure>
  );
}

export function BlockView({ block }: { block: SectionBlock }) {
  if (block.kind === 'flow') return <FlowDiagram block={block} />;
  if (block.kind === 'table') return <DataTable block={block} />;
  return (
    <figure className="image-missing" id={block.id}>
      <div className="image-placeholder" role="img" aria-label="画像は提供されていません">
        画像なし
      </div>
      <figcaption>
        <span className="block-title">{block.title}</span>
        <p className="caption">{block.caption}</p>
      </figcaption>
    </figure>
  );
}
