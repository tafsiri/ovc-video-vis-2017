import React, { Component } from 'react';
import NetworkView from './NetworkView';
import AutoSize from './AutoSize';
import VideoListing from './VideoListing';

import metadata from '../data/metadata.json'
import './Videos.css';


class Videos extends Component {
  render() {
    return (
      <div className="videos-container">
        <AutoSize includeHeight={false} >
          <NetworkView
            metadata={metadata}
            height={750}
          />
        </AutoSize>
        <VideoListing
          metadata={metadata}
        />
      </div>
    );
  }
}

export default Videos;
