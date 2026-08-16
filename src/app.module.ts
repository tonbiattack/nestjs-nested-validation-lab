import { Body, Controller, Get, Module, Post } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsISO8601, IsString, ValidateNested } from "class-validator";

export class DeliveryWindowDto {
  @IsISO8601()
  arrivalAt!: string;
}

export class CreateShipmentDto {
  @IsString()
  recipient!: string;

  // HTTPから来るplain objectを、ネストされた検証用DTOへ変換する。
  @ValidateNested()
  @Type(() => DeliveryWindowDto)
  delivery!: DeliveryWindowDto;
}

export interface Shipment {
  id: number;
  recipient: string;
  arrivalAt: string;
}

export class ShipmentsService {
  private readonly shipments: Shipment[] = [];

  create(dto: CreateShipmentDto): Shipment {
    const shipment = {
      id: this.shipments.length + 1,
      recipient: dto.recipient,
      arrivalAt: dto.delivery.arrivalAt
    };

    this.shipments.push(shipment);
    return shipment;
  }

  count(): number {
    return this.shipments.length;
  }
}

@Controller("shipments")
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Post()
  create(@Body() dto: CreateShipmentDto): Shipment {
    return this.shipments.create(dto);
  }

  @Get("count")
  count(): { count: number } {
    return { count: this.shipments.count() };
  }
}

@Module({
  controllers: [ShipmentsController],
  providers: [ShipmentsService]
})
export class AppModule {}
