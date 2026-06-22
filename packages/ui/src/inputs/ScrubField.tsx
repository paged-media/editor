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

import type { ReactNode } from "react";

import {
  useScrubGesture,
  type ScrubGestureOptions,
} from "@paged-media/shell";

export interface ScrubFieldProps
  extends Omit<ScrubGestureOptions, "onUpdate" | "onCommit" | "onCancel"> {
  /** Fires on begin + every pointer-move. */
  onUpdate?: (value: number, phase: "begin" | "update") => void;
  onCommit?: (value: number, initial: number) => void;
  onCancel?: () => void;
  /** Render-prop body. The wrapper applies the scrub bind ref +
   * `ew-resize` cursor; callers focus on visuals. */
  children: (state: { value: number; isScrubbing: boolean }) => ReactNode;
  className?: string;
  "aria-label"?: string;
}

/**
 * Lowest-level scrub primitive — wraps `useScrubGesture` and
 * exposes the bind ref + state through a render-prop. Use when a
 * `NumberInput` doesn't fit (the scrub target is a slider thumb,
 * an angle dial, a colour-channel block, …).
 */
export function ScrubField(props: ScrubFieldProps) {
  const { children, className, onUpdate, onCommit, onCancel, ...gestureOpts } =
    props;
  const scrub = useScrubGesture({
    ...gestureOpts,
    onUpdate,
    onCommit,
    onCancel,
  });
  return (
    <div
      ref={scrub.bind}
      className={className}
      role="slider"
      aria-label={props["aria-label"]}
      aria-valuenow={scrub.value}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      style={{ touchAction: "none", cursor: "ew-resize" }}
    >
      {children({ value: scrub.value, isScrubbing: scrub.isScrubbing })}
    </div>
  );
}
