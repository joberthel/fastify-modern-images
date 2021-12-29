import { Stream } from 'stream';

export async function stream2buffer(stream: Stream) {
    return new Promise<Buffer>((resolve, reject) => {
        const _buf = Array<any>();

        stream.on('data', chunk => _buf.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(_buf)));
        stream.on('error', err => reject(`error converting stream - ${err}`));
    });
}

export function supportedFormats(accept: string = '') {
    const accepts = accept.split(',');

    const formats = [
        {
            format: 'avif',
            supported: accepts.includes('image/avif'),
            alpha: true,
            opts: {
                quality: 64,
                speed: 7
            }
        },
        {
            format: 'webp',
            supported: accepts.includes('image/webp'),
            alpha: true,
            opts: {
                quality: 82
            }
        },
        {
            format: 'jpeg',
            supported: true,
            alpha: false,
            opts: {
                quality: 80
            }
        },
        {
            format: 'png',
            supported: true,
            alpha: true,
            opts: {
                quality: 90
            }
        }
    ];

    return formats.filter(format => format.supported);
}

export function isImage(contentType: string) {
    return /^image\//.test(contentType);
}

export function getFormat(contentType: string) {
    const matches = contentType.match(/^image\/(.+)$/);
    return (matches === null ? undefined : matches[1]) || '';
}
