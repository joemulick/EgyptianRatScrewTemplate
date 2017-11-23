import React from 'react';
import Layout from '../../components/Layout';
import Game from './Game';

const title = 'Lets Play!';

function action() {
  return {
    chunks: ['game'],
    title,
    component: (
      <Layout>
        <Game title={title} />
      </Layout>
    ),
  };
}

export default action;
