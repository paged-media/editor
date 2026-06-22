/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

import { InspectorTree, NodeId, nodeKey } from "./inspector";

interface Props {
  tree: InspectorTree;
  selectedKey: string | null;
  onSelect: (node: NodeId) => void;
  onSelectPage: (pageIndex: number) => void;
}

export function Tree(props: Props) {
  return (
    <ul className="tree">
      {props.tree.spreads.map((spread) => (
        <li key={spread.index} className="tree-spread">
          <div className="tree-label tree-label-spread">{spread.label}</div>
          <ul>
            {spread.pages.map((page) => (
              <li key={page.index} className="tree-page">
                <button
                  className="tree-label tree-label-page"
                  onClick={() => props.onSelectPage(page.index)}
                >
                  {page.label}
                </button>
                <ul>
                  {page.frames.map((frame) => {
                    const key = nodeKey(frame.id);
                    const isSelected = key === props.selectedKey;
                    return (
                      <li key={key}>
                        <button
                          className={
                            "tree-label tree-label-frame" +
                            (isSelected ? " selected" : "")
                          }
                          onClick={() => {
                            props.onSelect(frame.id);
                            props.onSelectPage(page.index);
                          }}
                        >
                          {frame.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
