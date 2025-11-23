import { Injectable } from '@nestjs/common';
import { gql, GraphQLClient } from 'graphql-request';
import { IMarketDataProvider } from '../../../domain/ports/IMarketDataProvider';
import { Candle } from '../../../domain/entities/Candle';

@Injectable()
export class UniswapGraphAdapter implements IMarketDataProvider {
  private client: GraphQLClient;
  private readonly SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';

  constructor() {
    this.client = new GraphQLClient(this.SUBGRAPH_URL);
  }

  async getHistory(poolAddress: string, hours: number): Promise<Candle[]> {
    const now = Math.floor(Date.now() / 1000);
    const start = now - hours * 3600;

    const query = gql`
      query GetPoolHourDatas($pool: String!, $start: Int!) {
        poolHourDatas(
          where: { pool: $pool, periodStartUnix_gt: $start }
          orderBy: periodStartUnix
          orderDirection: asc
          first: 1000
        ) {
          periodStartUnix
          open
          high
          low
          close
          volumeUSD
        }
      }
    `;

    const data = await this.client.request<any>(query, {
      pool: poolAddress.toLowerCase(),
      start,
    });

    return data.poolHourDatas.map(this.mapToCandle);
  }

  async getLatestCandle(poolAddress: string): Promise<Candle> {
    const query = gql`
      query GetLatestCandle($pool: String!) {
        poolHourDatas(
          where: { pool: $pool }
          orderBy: periodStartUnix
          orderDirection: desc
          first: 1
        ) {
          periodStartUnix
          open
          high
          low
          close
          volumeUSD
        }
      }
    `;

    const data = await this.client.request<any>(query, {
      pool: poolAddress.toLowerCase(),
    });

    if (!data.poolHourDatas || data.poolHourDatas.length === 0) {
      throw new Error(`No candle data found for pool ${poolAddress}`);
    }

    return this.mapToCandle(data.poolHourDatas[0]);
  }

  private mapToCandle(data: any): Candle {
    return new Candle(
      new Date(data.periodStartUnix * 1000),
      parseFloat(data.open),
      parseFloat(data.high),
      parseFloat(data.low),
      parseFloat(data.close),
      parseFloat(data.volumeUSD),
    );
  }
}

