import { CustomScalar } from '@nestjs/graphql';
import { Dayjs } from 'dayjs';
export declare class DateTimeScalar implements CustomScalar<string, Dayjs | null> {
    description: string;
    parseValue(value: string): Dayjs;
    serialize(value: Dayjs): string;
    parseLiteral(ast: any): Dayjs | null;
}
