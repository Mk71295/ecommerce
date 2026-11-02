import {
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Role } from '../common/enums/role.enum.js';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { isDuplicateKeyError } from '../common/utils/money.js';
import { toPage } from '../common/utils/paginate.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';
import { User, type UserDocument } from './schemas/user.schema.js';

interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly config: ConfigService,
  ) {}

  /** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if configured. */
  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;

    const exists = await this.userModel.exists({ email: email.toLowerCase().trim() });
    if (!exists) {
      await this.create({ name: 'Admin', email, password, role: Role.Admin });
    }
  }

  async create(input: CreateUserInput): Promise<UserDocument> {
    const password = await bcrypt.hash(input.password, 10);
    try {
      return await this.userModel.create({ ...input, password });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictException('Email is already registered');
      }
      throw err;
    }
  }

  findByEmailWithPassword(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('+password')
      .exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll({ page, limit }: PaginationQueryDto) {
    const [data, total] = await Promise.all([
      this.userModel
        .find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments().exec(),
    ]);
    return toPage(data, total, page, limit);
  }
}
