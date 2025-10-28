import ScrapedProfile from '../models/ScrapedProfile.js';
import Connection from '../models/Connection.js';
import Message from '../models/Message.js';
import { saveProfileToSheet } from './googlePeopleSheetService.js';
import { logConnectionRequest as saveToConnectionSheet } from './googleConnectionsSheetService.js';
import { logMessageToSheet } from './googleMessagesSheetService.js';

/**
 * Save scraped profile to BOTH MongoDB AND Google Sheets
 */
export async function saveScrapedProfile(profileData, userId, searchKeyword) {
  try {
    console.log('💾 Saving profile to dual storage...');
    
    // 1. Save to MongoDB
    const mongoProfile = await ScrapedProfile.findOneAndUpdate(
      { profileUrl: profileData.profileUrl },
      {
        ...profileData,
        scrapedBy: userId,
        searchKeyword,
        scrapedDate: new Date()
      },
      { upsert: true, new: true }
    );
    console.log('✅ Saved to MongoDB');

    // 2. Save to Google Sheets
    await saveProfileToSheet(profileData);
    console.log('✅ Saved to Google Sheets');

    return {
      success: true,
      mongoId: mongoProfile._id,
      message: 'Profile saved to both MongoDB and Google Sheets'
    };
  } catch (error) {
    console.error('❌ Error saving to dual storage:', error);
    throw error;
  }
}

/**
 * Save connection to BOTH MongoDB AND Google Sheets
 */
export async function saveConnection(connectionData, userId, messageContent = '') {
  try {
    console.log('💾 Saving connection to dual storage...');
    
    // 1. Save to MongoDB
    const mongoConnection = await Connection.create({
      ...connectionData,
      userId,
      messageContent
    });
    console.log('✅ Saved to MongoDB');

    // 2. Save to Google Sheets
    await saveToConnectionSheet(connectionData, messageContent);
    console.log('✅ Saved to Google Sheets');

    return {
      success: true,
      mongoId: mongoConnection._id,
      message: 'Connection saved to both MongoDB and Google Sheets'
    };
  } catch (error) {
    console.error('❌ Error saving connection:', error);
    throw error;
  }
}

/**
 * Save message to BOTH MongoDB AND Google Sheets
 */
export async function saveMessage(messageData, userId) {
  try {
    console.log('💾 Saving message to dual storage...');
    
    const messageId = `MSG${Date.now()}`;
    
    // 1. Save to MongoDB
    const mongoMessage = await Message.create({
      ...messageData,
      messageId,
      userId,
      sentDate: new Date()
    });
    console.log('✅ Saved message to MongoDB');

    // 2. Save to Google Sheets
    await logMessageToSheet({
      ...messageData,
      messageId
    });
    console.log('✅ Saved message to Google Sheets');

    return {
      success: true,
      mongoId: mongoMessage._id,
      messageId,
      message: 'Message saved to both MongoDB and Google Sheets'
    };
  } catch (error) {
    console.error('❌ Error saving message:', error);
    throw error;
  }
}

/**
 * Get data from MongoDB with pagination
 */
export async function getScrapedProfiles(userId, filters = {}, page = 1, limit = 50) {
  try {
    const query = { scrapedBy: userId, ...filters };
    const skip = (page - 1) * limit;
    
    const [profiles, total] = await Promise.all([
      ScrapedProfile.find(query)
        .sort({ scrapedDate: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      ScrapedProfile.countDocuments(query)
    ]);

    return {
      data: profiles,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Error fetching profiles:', error);
    throw error;
  }
}

export async function getConnections(userId, status = null, page = 1, limit = 50) {
  try {
    const query = { userId };
    if (status) query.status = status;
    
    const skip = (page - 1) * limit;

    const [connections, total] = await Promise.all([
      Connection.find(query)
        .sort({ requestSentDate: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      Connection.countDocuments(query)
    ]);

    return {
      data: connections,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Error fetching connections:', error);
    throw error;
  }
}

export async function getMessages(userId, page = 1, limit = 50) {
  try {
    const query = { userId };
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ sentDate: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      Message.countDocuments(query)
    ]);

    return {
      data: messages,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
}
