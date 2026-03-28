
import { Buffer } from 'buffer';

export class BinaryWriter {
    private buffers: Buffer[] = [];
    private currentSize = 0;

    writeU8(value: number) {
        const buf = Buffer.allocUnsafe(1);
        buf.writeUInt8(value || 0, 0);
        this.append(buf);
    }

    writeU16(value: number) {
        const buf = Buffer.allocUnsafe(2);
        buf.writeUInt16LE(value || 0, 0);
        this.append(buf);
    }

    writeU32(value: number) {
        const buf = Buffer.allocUnsafe(4);
        buf.writeUInt32LE(value || 0, 0);
        this.append(buf);
    }

    writeI32(value: number) {
        const buf = Buffer.allocUnsafe(4);
        buf.writeInt32LE(value || 0, 0);
        this.append(buf);
    }

    writeF32(value: number) {
        const buf = Buffer.allocUnsafe(4);
        buf.writeFloatLE(value || 0, 0);
        this.append(buf);
    }

    writeF64(value: number) {
        const buf = Buffer.allocUnsafe(8);
        buf.writeDoubleLE(value || 0, 0);
        this.append(buf);
    }

    writeString(str: string) {
        const buf = Buffer.from(str, 'utf-8');
        this.writeU16(buf.length);
        this.append(buf);
    }

    writeBool(val: boolean) {
        this.writeU8(val ? 1 : 0);
    }

    // Generic Helpers
    writeOption<T>(val: T | undefined | null, writer: (v: T) => void) {
        if (val !== undefined && val !== null) {
            this.writeU8(1);
            writer(val);
        } else {
            this.writeU8(0);
        }
    }

    writeVec<T>(arr: T[], writer: (v: T) => void) {
        this.writeU32(arr.length);
        for (const item of arr) {
            writer(item);
        }
    }

    writeMap<K, V>(map: Record<string, V> | Map<string, V>, writerVal: (v: V) => void) {
        let entries: [string, V][];
        if (map instanceof Map) {
            entries = Array.from(map.entries());
        } else {
            entries = Object.entries(map);
        }
        this.writeU32(entries.length);
        for (const [k, v] of entries) {
            this.writeString(k);
            writerVal(v);
        }
    }

    private append(buf: Buffer) {
        this.buffers.push(buf);
        this.currentSize += buf.length;
    }

    toBuffer(): Buffer {
        return Buffer.concat(this.buffers, this.currentSize);
    }
}
