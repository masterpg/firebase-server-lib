import * as convertHrtime from 'convert-hrtime'
import { google } from '@google-cloud/logging/build/protos/protos'

export enum LoggingSeverity {
  DEBUG = google.logging.type.LogSeverity.DEBUG,
  INFO = google.logging.type.LogSeverity.INFO,
  WARNING = google.logging.type.LogSeverity.WARNING,
  ERROR = google.logging.type.LogSeverity.ERROR,
}

export interface LoggingLatencyData {
  seconds: number
  nanos: number
}

export class LoggingLatencyTimer {
  private m_startTime: [number, number] = [0, 0]

  private m_diff: convertHrtime.HRTime = { seconds: 0, milliseconds: 0, nanoseconds: 0 }

  get diff() {
    return this.m_diff
  }

  private m_data: LoggingLatencyData = { seconds: 0, nanos: 0 }

  get data(): LoggingLatencyData {
    return this.m_data
  }

  start(): LoggingLatencyTimer {
    this.m_startTime = process.hrtime()
    this.m_diff = { seconds: 0, milliseconds: 0, nanoseconds: 0 }
    this.m_data = { seconds: 0, nanos: 0 }
    return this
  }

  stop(): LoggingLatencyTimer {
    this.m_diff = convertHrtime(process.hrtime(this.m_startTime))
    this.m_data = {
      seconds: Math.floor(this.diff.seconds),
      nanos: this.diff.nanoseconds - Math.floor(this.diff.seconds) * 1e9,
    }
    return this
  }
}
