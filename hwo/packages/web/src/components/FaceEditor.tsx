/**
 * FaceEditor——球员头像定制编辑器
 *
 * 基于 facesjs 面部数据，提供实时预览 + 部位/配色编辑。
 * 受控组件：face 由父级持有，改动通过 onChange 回传新对象（不可变更新）。
 */

import { PlayerFace } from "./PlayerFace";
import {
  generateFace,
  faceFeatureIds,
  FACE_SKIN_COLORS,
  FACE_HAIR_COLORS,
  type PlayerFace as PlayerFaceData,
  type EditableFeature,
} from "@hwo/shared";

interface Props {
  face: PlayerFaceData;
  onChange: (face: PlayerFaceData) => void;
}

const FEATURE_LABELS: Record<EditableFeature, string> = {
  head: "脸型",
  hair: "发型",
  eye: "眼睛",
  eyebrow: "眉毛",
  nose: "鼻子",
  mouth: "嘴巴",
  facialHair: "胡须",
  glasses: "眼镜",
  accessories: "配饰",
  jersey: "球衣",
};

/** 编辑器展示且可切换 id 的部位（顺序即展示顺序） */
const FEATURES: EditableFeature[] = [
  "head", "hair", "eyebrow", "eye", "nose", "mouth", "facialHair", "glasses", "accessories", "jersey",
];

/** 不可变地替换某部位的 id */
function updateFeatureId(face: PlayerFaceData, key: EditableFeature, id: string): PlayerFaceData {
  const current = face[key] as { id: string } & Record<string, unknown>;
  return { ...face, [key]: { ...current, id } };
}

export function FaceEditor({ face, onChange }: Props) {
  return (
    <div className="face-editor">
      <div className="face-editor-preview">
        <PlayerFace face={face} size={150} className="face-editor-avatar" />
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange(generateFace())}
          title="随机生成一张新头像"
        >
          🎲 随机生成
        </button>
      </div>

      <div className="face-editor-controls">
        {/* 胖瘦 */}
        <label className="face-field">
          <span className="face-field-label">胖瘦</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(face.fatness * 100)}
            onChange={(e) => onChange({ ...face, fatness: Number(e.target.value) / 100 })}
          />
        </label>

        {/* 肤色 */}
        <div className="face-field">
          <span className="face-field-label">肤色</span>
          <div className="face-swatches">
            {FACE_SKIN_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`face-swatch${face.body.color === color ? " is-active" : ""}`}
                style={{ background: color }}
                onClick={() => onChange({ ...face, body: { ...face.body, color } })}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* 发色 */}
        <div className="face-field">
          <span className="face-field-label">发色</span>
          <div className="face-swatches">
            {FACE_HAIR_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`face-swatch${face.hair.color === color ? " is-active" : ""}`}
                style={{ background: color }}
                onClick={() => onChange({ ...face, hair: { ...face.hair, color } })}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* 各部位 */}
        {FEATURES.map((key) => {
          const ids = faceFeatureIds(key);
          if (ids.length === 0) return null;
          const current = (face[key] as { id: string }).id;
          return (
            <label className="face-field" key={key}>
              <span className="face-field-label">{FEATURE_LABELS[key]}</span>
              <select
                value={current}
                onChange={(e) => onChange(updateFeatureId(face, key, e.target.value))}
              >
                {ids.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
