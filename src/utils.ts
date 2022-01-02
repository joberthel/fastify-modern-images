import { Stream } from 'stream';
import { Metadata } from 'sharp';
import { FastifyModernImagesOptionsCompression } from '.';

export async function stream2buffer(stream: Stream): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const _buf = Array<any>();

        stream.on('data', chunk => _buf.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(_buf)));
        stream.on('error', err => reject(`error converting stream - ${err}`));
    });
}

export function guard(regex: RegExp, path: string = '/'): boolean {
    return regex.test(path);
}

export function validatePayload(contentType: string = '', validContentTypes: string[], payload: unknown): boolean {
    return validContentTypes.includes(contentType) && (payload instanceof Stream || payload instanceof Buffer);
}

export function getBestFormat(accept: string = '', metadata: Metadata, formats: FastifyModernImagesOptionsCompression[]): FastifyModernImagesOptionsCompression | false {
    // @ts-expect-error
    formats = formats.filter(item => item.enabled && (!metadata.hasAlpha || item.alpha) && item.supported(accept)).sort((a, b) => b.priority - a.priority);

    if (formats.length > 0) {
        return formats[0];
    }

    return false;
}
