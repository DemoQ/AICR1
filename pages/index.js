/*
 * @Author: renya.zyc
 * @Date: 2021-06-02 01:44:15
 * @LastEditors: renya.zyc
 * @LastEditTime: 2021-07-12 17:49:05
 * @FilePath: /nextjs-blog/pages/index.js
 * @Description:
 */
import Head from 'next/head';
import Link from 'next/link';
import Layout, { siteTitle } from '../components/layout';
import utilStyles from '../styles/utils.module.css';
import { getSortedPostsData } from '../lib/posts';
import Date from '../components/date';
import products from '../data/products.json';

export default function Home({ allPostsData, products }) {
  return (
    <Layout home>
      <Head>
        <title>{siteTitle}</title>
      </Head>
      <section className={utilStyles.headingMd}>
        <p>[Your Self Introduction]</p>
        <p>
          (This is a sample website - you’ll be building a site like this on{' '}
          <a href='https://www.nextjs.cn/learn'>our Next.js tutorial</a>.)
        </p>
      </section>
      <section className={`${utilStyles.headingMd} ${utilStyles.padding1px}`}>
        <h2 className={utilStyles.headingLg}>商品介绍</h2>
        <ul className={utilStyles.list}>
          {products.map(({ id, name, price, description }) => (
            <li className={utilStyles.listItem} key={id}>
              {name}
              <br />
              <small className={utilStyles.lightText}>
                ¥{price.toFixed(2)} · {description}
              </small>
            </li>
          ))}
        </ul>
      </section>
      <section className={`${utilStyles.headingMd} ${utilStyles.padding1px}`}>
        <h2 className={utilStyles.headingLg}>Blog</h2>
        <ul className={utilStyles.list}>
          {allPostsData.map(({ id, date, title }) => (
            <li className={utilStyles.listItem} key={id}>
              <Link href={`/posts/${id}`}>
                <a>{title}</a>
              </Link>
              <br />
              <small className={utilStyles.lightText}>
                <Date dateString={date} />
              </small>
            </li>
          ))}
        </ul>
      </section>
    </Layout>
  );
}

export async function getStaticProps() {
  const allPostsData = getSortedPostsData();
  return {
    props: {
      allPostsData,
      products,
    },
  };
}
