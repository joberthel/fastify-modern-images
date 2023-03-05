export type MinifyQuerystring = {
    quality?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
    width?: string;
    height?: string;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    position?:
        | 'top'
        | 'right top'
        | 'right'
        | 'right bottom'
        | 'bottom'
        | 'left bottom'
        | 'left'
        | 'left top'
        | 'orth'
        | 'northeast'
        | 'east'
        | 'southeast'
        | 'south'
        | 'southwest'
        | 'west'
        | 'northwest'
        | 'center'
        | 'centre'
        | 'entropy'
        | 'attention';
    background?: string;
    /** Shortcuts */
    q: MinifyQuerystring['quality'];
    w: MinifyQuerystring['width'];
    h: MinifyQuerystring['height'];
    f: MinifyQuerystring['fit'];
    p: MinifyQuerystring['position'];
    b: MinifyQuerystring['background'];
};

export type MinifyRequest = {
    Querystring: MinifyQuerystring;
};

const imageFormats = <const>['avif', 'webp', 'jpeg', 'png'];

export type ImageFormat = typeof imageFormats[number];

export type FastifyModernImagesOptions = {
    regex?: RegExp;
    quality?: string;
    compression?: Record<string, FastifyModernImagesOptionsCompression>;
};

export type FastifyModernImagesOptionsCompression = {
    enabled?: boolean;
    format?: ImageFormat;
    priority?: number;
    alpha?: boolean;
    quality?: Record<string, number>;
    options?: Record<string, any>;
    contentType?: string;
    supported?: (accept: string) => boolean;
};
