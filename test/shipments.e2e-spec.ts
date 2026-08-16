import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("POST /shipments", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidUnknownValues: false
      })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects an invalid nested delivery date and leaves the shipment store unchanged", async () => {
    const response = await request(app.getHttpServer())
      .post("/shipments")
      .send({
        recipient: "tonbi",
        delivery: { arrivalAt: "tomorrow-morning" }
      });

    expect(response.status).toBe(400);

    const count = await request(app.getHttpServer()).get("/shipments/count");
    expect(count.status).toBe(200);
    expect(count.body).toEqual({ count: 0 });
  });

  it("creates a shipment when the nested delivery date is valid", async () => {
    const response = await request(app.getHttpServer())
      .post("/shipments")
      .send({
        recipient: "tonbi",
        delivery: { arrivalAt: "2026-08-16T10:00:00.000Z" }
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 1,
      recipient: "tonbi",
      arrivalAt: "2026-08-16T10:00:00.000Z"
    });
  });
});
