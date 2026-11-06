import { type FaceConfig, type Gender, type Overrides, type Race } from "./common.js";
export declare const colors: {
    white: {
        skin: string[];
        hair: string[];
    };
    asian: {
        skin: string[];
        hair: string[];
    };
    brown: {
        skin: string[];
        hair: string[];
    };
    black: {
        skin: string[];
        hair: string[];
    };
};
export declare const numberRanges: {
    readonly "body.size": {
        readonly female: readonly [0.8, 0.9];
        readonly male: readonly [0.95, 1.05];
    };
    readonly fatness: {
        readonly female: readonly [0, 0.4];
        readonly male: readonly [0, 1];
    };
    readonly "ear.size": {
        readonly female: readonly [0.5, 1];
        readonly male: readonly [0.5, 1.5];
    };
    readonly "eye.angle": {
        readonly female: readonly [-10, 15];
        readonly male: readonly [-10, 15];
    };
    readonly "eyebrow.angle": {
        readonly female: readonly [-15, 20];
        readonly male: readonly [-15, 20];
    };
    readonly "head.shave": {
        readonly female: readonly [0, 0];
        readonly male: readonly [0, 0.2];
    };
    readonly "nose.size": {
        readonly female: readonly [0.5, 1];
        readonly male: readonly [0.5, 1.25];
    };
    readonly "smileLine.size": {
        readonly female: readonly [0.25, 2.25];
        readonly male: readonly [0.25, 2.25];
    };
};
export declare const generate: (overrides?: Overrides, options?: {
    gender?: Gender;
    race?: Race;
    relative?: FaceConfig;
}) => FaceConfig;
