import chai from 'chai';
import { PassThrough } from 'stream';
import chaiAsPromised from 'chai-as-promised';
import { getBestFormat, guard, stream2buffer, validatePayload } from '../src/utils';

chai.use(chaiAsPromised);

const { expect } = chai;

describe('utils', () => {
    it('should convert stream to buffer', async () => {
        let stream = new PassThrough();
        stream.write('foo bar');
        stream.end();

        expect((await stream2buffer(stream)).toString()).to.eq('foo bar');

        stream = new PassThrough();
        stream.write('foo bar');
        stream.destroy(new Error('foo-bar'));

        await expect(stream2buffer(stream)).to.eventually.be.rejectedWith('error converting stream - Error: foo-bar');
    });

    it('should guard by url', () => {
        expect(guard(/\/foo-bar/, '/foo-bar/hello-world.jpg')).to.be.true;
        expect(guard(/\/foo-bar/, '/bar-foo/hello-world.jpg')).to.be.false;
        expect(guard(/\/foo-bar/, undefined)).to.be.false;
    });

    it('should validate payload', () => {
        expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], Buffer.from('foo bar'))).to.be.true;
        expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], new PassThrough())).to.be.true;

        expect(validatePayload('image/jpeg', ['image/jpeg', 'image/png'], 'foo bar')).to.be.false;
        expect(validatePayload('image/avif', ['image/jpeg', 'image/png'], 'foo bar')).to.be.false;
        expect(validatePayload(undefined, ['image/jpeg', 'image/png'], 'foo bar')).to.be.false;
    });

    it('should select best format', () => {
        let formats = [
            { enabled: true, format: 'image/jpeg', alpha: false, priority: 2, supported: accept => true },
            { enabled: false, format: 'image/avif', alpha: true, priority: 4, supported: accept => accept.includes('image/avif') },
            { enabled: true, format: 'image/webp', alpha: true, priority: 3, supported: accept => accept.includes('image/webp') },
            { enabled: true, format: 'image/png', alpha: true, priority: 1, supported: accept => true }
        ];

        expect((getBestFormat('image/webp,image/avif', { hasAlpha: false } as any, formats as any) as any).format).to.eq('image/webp');
        expect((getBestFormat(undefined, { hasAlpha: true } as any, formats as any) as any).format).to.eq('image/png');

        formats = [
            { enabled: false, format: 'image/avif', alpha: true, priority: 4, supported: accept => accept.includes('image/avif') },
            { enabled: true, format: 'image/webp', alpha: true, priority: 3, supported: accept => accept.includes('image/webp') }
        ];

        expect(getBestFormat('image/avif', { hasAlpha: false } as any, formats as any) as any).to.be.false;
    });
});
