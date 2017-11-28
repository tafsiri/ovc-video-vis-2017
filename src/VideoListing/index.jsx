import React, { Component } from 'react';

import './index.css'

export default class VideoListing extends Component {

  static defaultProps = {
  }

  constructor(props) {
    super(props)

    this.state = {
      openPlayers: {}
    };

    this.renderVideo = this.renderVideo.bind(this);
    this.togglePlayArea = this.togglePlayArea.bind(this);
  }

  togglePlayArea(videoMeta) {
    const openPlayers = this.state.openPlayers;
    openPlayers[videoMeta.id] = !openPlayers[videoMeta.id];
    this.setState({
      openPlayers,
    })
  }

  renderVideoArea(videoMeta) {
    const d = videoMeta;
    const { openPlayers } = this.state;


    if (openPlayers[d.id]) {
      return (
        <div className="video-area">
          <div className="videoWrapper">
            <iframe
              width="560"
              height="315"
              src={`https://www.youtube.com/embed/${d.youtubeId}`}
              frameBorder="0"
              allowFullScreen
              wmode="opaque"
            />
          </div>
        </div>
      );
    }
  }

  renderVideo(videoMeta) {
    const { openPlayers } = this.state;

    const d = videoMeta
    return (
      <div className="video-item" key={`${d.id}-video-item`} id={`${d.id}-video-item`}>
        <a name={`${d.id}-video-item`} />
        <div className="portrait">
          <img
            src={`/img/portraits/${d.portrait}`}
            alt={d.name}
          />
        </div>
        <div className="talk-info">
          <p className='name'>{d.name}</p>
          <p className='title'>{d.title}</p>
        </div>
        <div
          className="link-area"
        >
          {
            openPlayers[d.id] ?
              <span
                className="action"
                onClick={() => this.togglePlayArea(videoMeta)}
              >
                <img
                  className='player-icon'
                  src='/img/icons/close-icon.svg'
                  alt={`Close video for ${d.name}`}
                />
                <span>Close Video</span>
              </span> :
              <span
                className="action"
                onClick={() => this.togglePlayArea(videoMeta)}>
                <img
                  className='player-icon'
                  src='/img/icons/play-icon.svg'
                  alt={`Play video for ${d.name}`}
                />
              <span>Play Video</span>
              </span>
          }
          <span className="action">
            <a href={`/files/transcripts/${d.transcript}`} target="_blank">
              <img
                className='player-icon'
                src='/img/icons/subject-icon.svg'
                alt={`Download transcript for ${d.name}`}
              />
              <span>Transcript</span>
            </a>
          </span>
        </div>
        {this.renderVideoArea(videoMeta)}
      </div>
    )
  }

  render() {
    const {
      metadata
    } = this.props;
    return (
      <div className='VideoListing'>
          <hr className='top-bar'></hr>
          {metadata.map(this.renderVideo)}
      </div>
    )
  }
}
