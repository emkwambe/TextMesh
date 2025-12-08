/**
 * TextMesh Database Seed Script
 *
 * Populates the database with test data for development and testing.
 *
 * Usage:
 *   npx prisma db seed
 *   npx ts-node prisma/seeds/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Configuration
const SEED_CONFIG = {
  users: 50,
  postsPerUser: { min: 5, max: 20 },
  followsPerUser: { min: 5, max: 30 },
  likesPerUser: { min: 10, max: 50 },
  groups: 10,
  hashtags: 30,
};

// Helper functions
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomElements<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function generateUsername(index: number): string {
  const prefixes = ['user', 'dev', 'design', 'code', 'tech', 'creative', 'maker'];
  const prefix = prefixes[index % prefixes.length];
  return `${prefix}_${index}_${Date.now().toString(36)}`;
}

function generateDisplayName(index: number): string {
  const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Sam', 'Charlie', 'Drew', 'Quinn'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Lee'];
  return `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`;
}

function generateBio(): string {
  const bios = [
    'Building things on the internet.',
    'Coffee enthusiast. Code writer. 🚀',
    'Designer by day, developer by night.',
    'Just here for the memes.',
    'Making the world a better place, one commit at a time.',
    'Passionate about technology and innovation.',
    'Full-stack developer | Open source contributor',
    'Creating beautiful experiences.',
    'Learning something new every day.',
    'Tech enthusiast | Problem solver',
  ];
  return randomElement(bios);
}

function generatePostContent(): string {
  const posts = [
    'Just shipped a new feature! Feels great to see it live. 🚀',
    'Anyone else spending their weekend coding? No? Just me? 😅',
    'The best code is the code you dont have to write.',
    'Finally figured out that bug that was driving me crazy!',
    'Hot take: tabs > spaces. Fight me.',
    'Remember to take breaks. Your mental health matters. 💙',
    'Working on something exciting. Stay tuned!',
    'TIL about a cool new library. Game changer.',
    'Coffee count today: ☕☕☕☕ (and counting)',
    'Shoutout to everyone debugging in production. We see you. 👀',
    'What a beautiful day to write some code!',
    'Just discovered the magic of TypeScript. Where has this been all my life?',
    'Pro tip: read the error message. It usually tells you exactly whats wrong.',
    'Sometimes the best solution is the simplest one.',
    'Celebrating small wins today. Progress is progress!',
    'Anyone else think the hardest part of programming is naming things?',
    'Feeling grateful for this amazing community. ❤️',
    'New blog post up! Link in bio.',
    'The rubber duck debugging method actually works. Try it!',
    'Weekend project turned into a week-long project. Classic.',
  ];
  return randomElement(posts);
}

function generateHashtags(): string[] {
  const hashtags = [
    'coding', 'programming', 'developer', 'tech', 'javascript',
    'typescript', 'react', 'nodejs', 'webdev', 'opensource',
    'software', 'code', 'frontend', 'backend', 'fullstack',
    'learning', 'buildinpublic', 'startup', 'devlife', 'textmesh',
    'ai', 'machinelearning', 'cloud', 'devops', 'design',
    'ux', 'ui', 'mobile', 'ios', 'android',
  ];
  const count = randomInt(0, 4);
  return randomElements(hashtags, count);
}

async function seedUsers() {
  console.log('Seeding users...');

  const users = [];
  const passwordHash = await bcrypt.hash('password123', 12);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@textmesh.com' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@textmesh.com',
      displayName: 'TextMesh Admin',
      bio: 'Official TextMesh admin account',
      role: 'ADMIN',
      isVerified: true,
      settings: {
        create: {},
      },
    },
  });
  users.push(admin);
  console.log('  Created admin user');

  // Create demo user
  const demo = await prisma.user.upsert({
    where: { email: 'demo@textmesh.com' },
    update: {},
    create: {
      username: 'demo',
      email: 'demo@textmesh.com',
      displayName: 'Demo User',
      bio: 'This is a demo account for testing TextMesh features.',
      isVerified: true,
      settings: {
        create: {},
      },
    },
  });
  users.push(demo);
  console.log('  Created demo user');

  // Create regular users
  for (let i = 0; i < SEED_CONFIG.users; i++) {
    const user = await prisma.user.create({
      data: {
        username: generateUsername(i),
        email: `user${i}@test.textmesh.com`,
        displayName: generateDisplayName(i),
        bio: generateBio(),
        location: randomElement(['San Francisco', 'New York', 'London', 'Tokyo', 'Berlin', 'Remote']),
        website: Math.random() > 0.5 ? `https://example.com/user${i}` : null,
        isVerified: Math.random() > 0.9,
        settings: {
          create: {},
        },
      },
    });
    users.push(user);

    if ((i + 1) % 10 === 0) {
      console.log(`  Created ${i + 1} users`);
    }
  }

  console.log(`  Total users created: ${users.length}`);
  return users;
}

async function seedPosts(users: any[]) {
  console.log('Seeding posts...');

  const posts = [];

  for (const user of users) {
    const postCount = randomInt(
      SEED_CONFIG.postsPerUser.min,
      SEED_CONFIG.postsPerUser.max
    );

    for (let i = 0; i < postCount; i++) {
      const hashtags = generateHashtags();
      const content = generatePostContent() +
        (hashtags.length > 0 ? ' ' + hashtags.map(h => `#${h}`).join(' ') : '');

      const post = await prisma.post.create({
        data: {
          userId: user.id,
          content,
          visibility: randomElement(['PUBLIC', 'PUBLIC', 'PUBLIC', 'FOLLOWERS']),
          createdAt: new Date(
            Date.now() - randomInt(0, 30 * 24 * 60 * 60 * 1000) // Last 30 days
          ),
        },
      });
      posts.push(post);

      // Create hashtag relations
      for (const tag of hashtags) {
        const hashtag = await prisma.hashtag.upsert({
          where: { tag },
          update: { postCount: { increment: 1 } },
          create: { tag, postCount: 1 },
        });

        await prisma.postHashtag.create({
          data: {
            postId: post.id,
            hashtagId: hashtag.id,
          },
        }).catch(() => {}); // Ignore duplicates
      }
    }
  }

  console.log(`  Total posts created: ${posts.length}`);
  return posts;
}

async function seedReplies(users: any[], posts: any[]) {
  console.log('Seeding replies...');

  let replyCount = 0;

  for (const post of posts.slice(0, Math.floor(posts.length / 2))) {
    const numReplies = randomInt(0, 5);

    for (let i = 0; i < numReplies; i++) {
      const replyContent = randomElement([
        'Great post! 🔥',
        'I totally agree with this.',
        'Interesting perspective!',
        'Thanks for sharing!',
        'This is so true.',
        'Love this! 💙',
        'Needed to hear this today.',
        'Can you elaborate more on this?',
        'Saved for later!',
        '👏👏👏',
      ]);

      await prisma.post.create({
        data: {
          userId: randomElement(users).id,
          content: replyContent,
          parentId: post.id,
          visibility: 'PUBLIC',
          createdAt: new Date(
            new Date(post.createdAt).getTime() +
            randomInt(1, 24 * 60 * 60 * 1000)
          ),
        },
      });
      replyCount++;

      // Update reply count
      await prisma.post.update({
        where: { id: post.id },
        data: { replyCount: { increment: 1 } },
      });
    }
  }

  console.log(`  Total replies created: ${replyCount}`);
}

async function seedFollows(users: any[]) {
  console.log('Seeding follows...');

  let followCount = 0;

  for (const user of users) {
    const followsCount = randomInt(
      SEED_CONFIG.followsPerUser.min,
      SEED_CONFIG.followsPerUser.max
    );
    const usersToFollow = randomElements(
      users.filter(u => u.id !== user.id),
      followsCount
    );

    for (const followee of usersToFollow) {
      try {
        await prisma.follow.create({
          data: {
            followerId: user.id,
            followeeId: followee.id,
          },
        });
        followCount++;

        // Update counts
        await prisma.user.update({
          where: { id: user.id },
          data: { followingCount: { increment: 1 } },
        });
        await prisma.user.update({
          where: { id: followee.id },
          data: { followerCount: { increment: 1 } },
        });
      } catch {
        // Ignore duplicate follows
      }
    }
  }

  console.log(`  Total follows created: ${followCount}`);
}

async function seedLikes(users: any[], posts: any[]) {
  console.log('Seeding likes...');

  let likeCount = 0;

  for (const user of users) {
    const likesCount = randomInt(
      SEED_CONFIG.likesPerUser.min,
      SEED_CONFIG.likesPerUser.max
    );
    const postsToLike = randomElements(posts, likesCount);

    for (const post of postsToLike) {
      try {
        await prisma.postLike.create({
          data: {
            userId: user.id,
            postId: post.id,
          },
        });
        likeCount++;

        // Update like count
        await prisma.post.update({
          where: { id: post.id },
          data: { likeCount: { increment: 1 } },
        });
      } catch {
        // Ignore duplicate likes
      }
    }
  }

  console.log(`  Total likes created: ${likeCount}`);
}

async function seedGroups(users: any[]) {
  console.log('Seeding groups...');

  const groupNames = [
    { name: 'JavaScript Developers', slug: 'javascript-developers', description: 'A community for JavaScript enthusiasts' },
    { name: 'TypeScript Guild', slug: 'typescript-guild', description: 'Type-safe coding discussions' },
    { name: 'React Community', slug: 'react-community', description: 'Everything React' },
    { name: 'Node.js Enthusiasts', slug: 'nodejs-enthusiasts', description: 'Server-side JavaScript' },
    { name: 'Open Source Contributors', slug: 'open-source', description: 'Open source collaboration' },
    { name: 'Startup Founders', slug: 'startup-founders', description: 'For founders and builders' },
    { name: 'Design Systems', slug: 'design-systems', description: 'Design system discussions' },
    { name: 'DevOps & Cloud', slug: 'devops-cloud', description: 'Infrastructure and deployment' },
    { name: 'Mobile Dev', slug: 'mobile-dev', description: 'iOS, Android, and cross-platform' },
    { name: 'AI & ML', slug: 'ai-ml', description: 'Artificial intelligence and machine learning' },
  ];

  for (const groupData of groupNames) {
    const owner = randomElement(users);

    const group = await prisma.group.upsert({
      where: { slug: groupData.slug },
      update: {},
      create: {
        name: groupData.name,
        slug: groupData.slug,
        description: groupData.description,
        privacy: randomElement(['PUBLIC', 'PUBLIC', 'PRIVATE']),
        ownerId: owner.id,
      },
    });

    // Add members
    const memberCount = randomInt(5, 20);
    const members = randomElements(users.filter(u => u.id !== owner.id), memberCount);

    for (const member of members) {
      try {
        await prisma.groupMembership.create({
          data: {
            groupId: group.id,
            userId: member.id,
            role: 'MEMBER',
          },
        });
      } catch {
        // Ignore duplicates
      }
    }

    // Update member count
    await prisma.group.update({
      where: { id: group.id },
      data: { memberCount: members.length + 1 }, // +1 for owner
    });
  }

  console.log(`  Total groups created: ${groupNames.length}`);
}

async function main() {
  console.log('🌱 Starting database seed...\n');

  try {
    // Clear existing data (optional - be careful in production!)
    if (process.env.CLEAR_DB === 'true') {
      console.log('Clearing existing data...');
      await prisma.postLike.deleteMany();
      await prisma.postBookmark.deleteMany();
      await prisma.postHashtag.deleteMany();
      await prisma.postMention.deleteMany();
      await prisma.follow.deleteMany();
      await prisma.groupMembership.deleteMany();
      await prisma.post.deleteMany();
      await prisma.group.deleteMany();
      await prisma.hashtag.deleteMany();
      await prisma.userSettings.deleteMany();
      await prisma.user.deleteMany();
      console.log('  Done clearing data\n');
    }

    // Seed data
    const users = await seedUsers();
    console.log('');

    const posts = await seedPosts(users);
    console.log('');

    await seedReplies(users, posts);
    console.log('');

    await seedFollows(users);
    console.log('');

    await seedLikes(users, posts);
    console.log('');

    await seedGroups(users);
    console.log('');

    console.log('✅ Database seeded successfully!');
    console.log('\nDemo account credentials:');
    console.log('  Email: demo@textmesh.com');
    console.log('  Password: password123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
